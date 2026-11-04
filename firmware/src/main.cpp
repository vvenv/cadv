#include <M5Cardputer.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ctime>

#include "config.h"

#if __has_include(<esp_sntp.h>)
#include <esp_sntp.h>
#elif __has_include(<sntp.h>)
#include <sntp.h>
#endif

namespace {

Preferences prefs;
String wifiSsid;
String wifiPass;
bool timeSynced     = false;
uint32_t lastResync = 0;
int lastDrawnSecond = -1;
String lastNtpError;
// Display is a reference bound in M5Cardputer's constructor. Capturing it
// during static init stores a null parent, and the first pushSprite crashes.
M5Canvas clockCanvas;
bool clockCanvasReady = false;

const char* const kWeekday[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

void ensureClockCanvas() {
    if (clockCanvasReady) {
        return;
    }
    auto& d = M5Cardputer.Display;
    clockCanvas.setColorDepth(16);
    clockCanvas.createSprite(d.width(), d.height());
    clockCanvasReady = true;
}

void drawStatus(const String& line1, const String& line2 = "") {
    auto& d = M5Cardputer.Display;
    d.fillScreen(TFT_BLACK);
    d.setTextDatum(middle_center);
    d.setTextColor(TFT_YELLOW, TFT_BLACK);
    d.setFont(&fonts::FreeSansBold12pt7b);
    d.setTextSize(1.0f);
    d.drawString(line1, d.width() / 2, d.height() / 2 - (line2.isEmpty() ? 0 : 16));
    if (!line2.isEmpty()) {
        d.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        d.setFont(&fonts::FreeSansBold9pt7b);
        d.drawString(line2, d.width() / 2, d.height() / 2 + 18);
    }
}

String promptLine(const String& title, const String& initial = "", bool mask = false) {
    String value = initial;
    auto& d      = M5Cardputer.Display;

    auto redraw = [&]() {
        d.fillScreen(TFT_BLACK);
        d.setTextDatum(top_left);
        d.setFont(&fonts::FreeSansBold9pt7b);
        d.setTextSize(1.0f);
        d.setTextColor(TFT_CYAN, TFT_BLACK);
        d.setCursor(4, 4);
        d.print(title);
        d.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        d.setCursor(4, 24);
        d.print("Enter=OK  Del=BS");
        d.drawRect(2, 48, d.width() - 4, 36, TFT_DARKGREY);
        d.setTextColor(TFT_WHITE, TFT_BLACK);
        d.setFont(&fonts::FreeSansBold12pt7b);
        d.setCursor(8, 58);
        if (mask && value.length() > 0) {
            String dots;
            dots.reserve(value.length());
            for (size_t i = 0; i < value.length(); ++i) {
                dots += '*';
            }
            d.print(dots);
        } else {
            d.print(value);
        }
        d.print('_');
    };

    redraw();

    while (true) {
        M5Cardputer.update();
        if (!M5Cardputer.Keyboard.isChange() || !M5Cardputer.Keyboard.isPressed()) {
            delay(10);
            continue;
        }

        Keyboard_Class::KeysState st = M5Cardputer.Keyboard.keysState();
        for (auto ch : st.word) {
            value += ch;
        }
        if (st.del && value.length() > 0) {
            value.remove(value.length() - 1);
        }
        if (st.enter) {
            return value;
        }
        redraw();
    }
}

bool loadWifiFromNvs() {
    prefs.begin("clock", true);
    wifiSsid = prefs.getString("ssid", "");
    wifiPass = prefs.getString("pass", "");
    prefs.end();
    return wifiSsid.length() > 0;
}

void saveWifiToNvs(const String& ssid, const String& pass) {
    prefs.begin("clock", false);
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    prefs.end();
}

void configureWifiInteractive() {
    drawStatus("Wi-Fi setup", "type on keyboard");
    delay(600);
    wifiSsid = promptLine("SSID", wifiSsid, false);
    wifiPass = promptLine("Password", "", true);
    saveWifiToNvs(wifiSsid, wifiPass);
}

bool connectWifi() {
    if (wifiSsid.isEmpty()) {
        return false;
    }

    drawStatus("Connecting Wi-Fi", wifiSsid);
    WiFi.mode(WIFI_STA);
    WiFi.disconnect(true, true);
    delay(200);
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < kWifiConnectTimeoutMs) {
        delay(250);
        M5Cardputer.update();
    }

    if (WiFi.status() == WL_CONNECTED && WiFi.localIP()) {
        drawStatus("Wi-Fi OK", WiFi.localIP().toString());
        delay(800);
        return true;
    }

    drawStatus("Wi-Fi failed", "Enter retry / C reconfig");
    while (true) {
        M5Cardputer.update();
        if (M5Cardputer.Keyboard.isChange() && M5Cardputer.Keyboard.isPressed()) {
            auto st = M5Cardputer.Keyboard.keysState();
            if (st.enter) {
                break;
            }
            if (M5Cardputer.Keyboard.isKeyPressed('c') || M5Cardputer.Keyboard.isKeyPressed('C')) {
                configureWifiInteractive();
                return connectWifi();
            }
        }
        delay(10);
    }
    return false;
}

bool dnsOk(const char* host) {
    IPAddress ip;
    drawStatus("DNS lookup", host);
    const bool ok = WiFi.hostByName(host, ip);
    if (ok) {
        Serial.printf("DNS %s -> %s\n", host, ip.toString().c_str());
    } else {
        Serial.printf("DNS %s failed\n", host);
    }
    return ok;
}

bool waitForValidLocalTime(uint32_t timeoutMs) {
    struct tm ti {};
    const uint32_t start = millis();
    while (millis() - start < timeoutMs) {
        // IMPORTANT: do NOT use sntp_get_sync_status() as success gate.
        // Reading COMPLETED clears it; a second read always looks like failure.
        if (getLocalTime(&ti, 200) && ti.tm_year >= (2020 - 1900)) {
            return true;
        }
        M5Cardputer.update();
        delay(50);
    }
    return false;
}

bool syncNtp() {
    lastNtpError = "";
    if (WiFi.status() != WL_CONNECTED) {
        lastNtpError = "WiFi down";
        drawStatus("NTP failed", lastNtpError);
        delay(1000);
        timeSynced = false;
        return false;
    }

    drawStatus("Syncing NTP", NTP_TIMEZONE);
    Serial.printf("NTP start tz=%s wifi=%s\n", NTP_TIMEZONE, WiFi.localIP().toString().c_str());

    // Verify DNS before SNTP; many "NTP failed" cases are DNS/network.
    if (!dnsOk(NTP_SERVER1) && !dnsOk(NTP_SERVER2) && !dnsOk(NTP_SERVER3)) {
        lastNtpError = "DNS fail";
        drawStatus("NTP failed", lastNtpError);
        delay(1200);
        timeSynced = false;
        return false;
    }

    // Give lwIP a beat after association before UDP NTP.
    delay(300);

    configTzTime(NTP_TIMEZONE, NTP_SERVER1, NTP_SERVER2, NTP_SERVER3);

    drawStatus("Waiting NTP", "up to 30s");
    timeSynced = waitForValidLocalTime(kNtpWaitTimeoutMs);

    if (timeSynced) {
        lastResync = millis();
        struct tm ti {};
        getLocalTime(&ti, 0);
        char buf[32];
        snprintf(buf, sizeof(buf), "%02d:%02d:%02d", ti.tm_hour, ti.tm_min, ti.tm_sec);
        drawStatus("Time synced", buf);
        Serial.printf("NTP ok %04d-%02d-%02d %s\n", ti.tm_year + 1900, ti.tm_mon + 1, ti.tm_mday, buf);
        delay(600);
    } else {
        lastNtpError = "timeout";
        drawStatus("NTP failed", lastNtpError + "  R=retry");
        Serial.println("NTP timeout waiting for valid local time");
        delay(1200);
    }
    return timeSynced;
}

void drawClock(const tm& ti) {
    ensureClockCanvas();
    auto& c = clockCanvas;
    char timeBuf[16];
    char dateBuf[32];
    snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", ti.tm_hour, ti.tm_min, ti.tm_sec);
    snprintf(dateBuf, sizeof(dateBuf), "%04d-%02d-%02d  %s", ti.tm_year + 1900, ti.tm_mon + 1,
             ti.tm_mday, kWeekday[ti.tm_wday]);

    // Compose off-screen, then one blit — avoids fillScreen black flash each second.
    c.fillSprite(TFT_BLACK);

    // Font7 is the 48px seven-segment face (digits, colon, space only).
    // "HH:MM:SS" is 216px wide, which fits the 240px panel.
    c.setTextDatum(middle_center);
    c.setTextColor(TFT_WHITE, TFT_BLACK);
    c.setFont(&fonts::Font7);
    c.setTextSize(1);
    c.drawString(timeBuf, c.width() / 2, c.height() / 2 - 12);

    c.setFont(&fonts::FreeSansBold9pt7b);
    c.setTextColor(TFT_CYAN, TFT_BLACK);
    c.drawString(dateBuf, c.width() / 2, c.height() / 2 + 36);

    c.setTextDatum(bottom_left);
    c.setTextColor(TFT_DARKGREY, TFT_BLACK);
    c.setFont(&fonts::Font0);
    c.drawString(timeSynced ? "NTP" : "NO NTP", 4, c.height() - 2);

    c.setTextDatum(bottom_right);
    if (WiFi.status() == WL_CONNECTED) {
        c.setTextColor(TFT_DARKGREEN, TFT_BLACK);
        c.drawString("WiFi", c.width() - 4, c.height() - 2);
    } else {
        c.setTextColor(TFT_MAROON, TFT_BLACK);
        c.drawString("WiFi?", c.width() - 4, c.height() - 2);
    }

    c.pushSprite(&M5Cardputer.Display, 0, 0);
}

void bootstrapNetwork() {
    const bool hasCompileTimeCreds =
        (String(WIFI_SSID).length() > 0 && String(WIFI_PASSWORD).length() > 0);

    if (hasCompileTimeCreds) {
        wifiSsid = WIFI_SSID;
        wifiPass = WIFI_PASSWORD;
    } else if (!loadWifiFromNvs()) {
        configureWifiInteractive();
    }

    while (!connectWifi()) {
        configureWifiInteractive();
    }

    // Retry NTP a few times at boot; UDP/DNS can flake once.
    for (int i = 0; i < 3 && !syncNtp(); ++i) {
        delay(500);
    }
}

}  // namespace

void setup() {
    Serial.begin(115200);
    delay(50);

    auto cfg = M5.config();
    M5Cardputer.begin(cfg, true);
    M5Cardputer.Display.setRotation(1);
    M5Cardputer.Display.setBrightness(128);

    drawStatus("Cardputer Clock", "starting...");
    delay(400);

    bootstrapNetwork();
    lastDrawnSecond = -1;
}

void loop() {
    M5Cardputer.update();

    if (M5Cardputer.Keyboard.isChange() && M5Cardputer.Keyboard.isPressed()) {
        if (M5Cardputer.Keyboard.isKeyPressed('r') || M5Cardputer.Keyboard.isKeyPressed('R')) {
            syncNtp();
            lastDrawnSecond = -1;
        }
        if (M5Cardputer.Keyboard.isKeyPressed('w') || M5Cardputer.Keyboard.isKeyPressed('W')) {
            configureWifiInteractive();
            connectWifi();
            syncNtp();
            lastDrawnSecond = -1;
        }
    }

    if (timeSynced && millis() - lastResync > kNtpResyncIntervalMs) {
        if (WiFi.status() != WL_CONNECTED) {
            connectWifi();
        }
        syncNtp();
        lastDrawnSecond = -1;
    }

    struct tm ti {};
    if (getLocalTime(&ti, 0) && ti.tm_year >= (2020 - 1900)) {
        timeSynced = true;
        if (ti.tm_sec != lastDrawnSecond) {
            lastDrawnSecond = ti.tm_sec;
            drawClock(ti);
        }
    } else {
        drawStatus("Waiting for time", lastNtpError.length() ? lastNtpError : "press R");
        delay(500);
    }

    delay(20);
}
