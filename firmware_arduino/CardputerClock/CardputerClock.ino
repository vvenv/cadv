#include <M5Cardputer.h>
#include <Preferences.h>
#include <WiFi.h>
#include <ctime>

#include "config.h"

#if __has_include(<esp_sntp.h>)
#include <esp_sntp.h>
#define SNTP_ENABLED 1
#elif __has_include(<sntp.h>)
#include <sntp.h>
#define SNTP_ENABLED 1
#else
#define SNTP_ENABLED 0
#endif

namespace {

Preferences prefs;
String wifiSsid;
String wifiPass;
bool timeSynced     = false;
uint32_t lastResync = 0;
int lastDrawnSecond = -1;

const char* const kWeekday[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};

void drawStatus(const String& line1, const String& line2 = "") {
    auto& d = M5Cardputer.Display;
    d.fillScreen(TFT_BLACK);
    d.setTextDatum(middle_center);
    d.setTextColor(TFT_YELLOW, TFT_BLACK);
    d.setFont(&fonts::Font2);
    d.drawString(line1, d.width() / 2, d.height() / 2 - (line2.isEmpty() ? 0 : 12));
    if (!line2.isEmpty()) {
        d.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        d.drawString(line2, d.width() / 2, d.height() / 2 + 12);
    }
}

String promptLine(const String& title, const String& initial = "", bool mask = false) {
    String value = initial;
    auto& d      = M5Cardputer.Display;

    auto redraw = [&]() {
        d.fillScreen(TFT_BLACK);
        d.setTextDatum(top_left);
        d.setFont(&fonts::Font2);
        d.setTextColor(TFT_CYAN, TFT_BLACK);
        d.setCursor(4, 4);
        d.print(title);
        d.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        d.setCursor(4, 22);
        d.print("Enter confirm  Del erase");
        d.drawRect(2, 44, d.width() - 4, 28, TFT_DARKGREY);
        d.setTextColor(TFT_WHITE, TFT_BLACK);
        d.setCursor(8, 52);
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
    WiFi.begin(wifiSsid.c_str(), wifiPass.c_str());

    const uint32_t start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < kWifiConnectTimeoutMs) {
        delay(250);
        M5Cardputer.update();
    }

    if (WiFi.status() == WL_CONNECTED) {
        drawStatus("Wi-Fi OK", WiFi.localIP().toString());
        delay(800);
        return true;
    }

    drawStatus("Wi-Fi failed", "press Enter retry");
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

bool syncNtp() {
    drawStatus("Syncing NTP", NTP_TIMEZONE);
    configTzTime(NTP_TIMEZONE, NTP_SERVER1, NTP_SERVER2, NTP_SERVER3);

    const uint32_t start = millis();
#if SNTP_ENABLED
    while (sntp_get_sync_status() != SNTP_SYNC_STATUS_COMPLETED &&
           millis() - start < kNtpWaitTimeoutMs) {
        delay(200);
        M5Cardputer.update();
    }
    timeSynced = (sntp_get_sync_status() == SNTP_SYNC_STATUS_COMPLETED);
#else
    struct tm ti {};
    while (!getLocalTime(&ti, 1000) && millis() - start < kNtpWaitTimeoutMs) {
        M5Cardputer.update();
    }
    timeSynced = getLocalTime(&ti, 100);
#endif

    if (timeSynced) {
        lastResync = millis();
        drawStatus("Time synced", NTP_TIMEZONE);
        delay(500);
    } else {
        drawStatus("NTP failed", "will retry");
        delay(1000);
    }
    return timeSynced;
}

void drawClock(const tm& ti) {
    auto& d = M5Cardputer.Display;
    char timeBuf[16];
    char dateBuf[32];
    snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", ti.tm_hour, ti.tm_min, ti.tm_sec);
    snprintf(dateBuf, sizeof(dateBuf), "%04d-%02d-%02d  %s", ti.tm_year + 1900, ti.tm_mon + 1,
             ti.tm_mday, kWeekday[ti.tm_wday]);

    d.fillScreen(TFT_BLACK);

    d.setTextDatum(middle_center);
    d.setTextColor(TFT_WHITE, TFT_BLACK);
    d.setFont(&fonts::FreeSansBold18pt7b);
    d.drawString(timeBuf, d.width() / 2, d.height() / 2 - 10);

    d.setFont(&fonts::Font2);
    d.setTextColor(TFT_CYAN, TFT_BLACK);
    d.drawString(dateBuf, d.width() / 2, d.height() / 2 + 28);

    d.setTextDatum(bottom_left);
    d.setTextColor(TFT_DARKGREY, TFT_BLACK);
    d.drawString(timeSynced ? "NTP" : "NO NTP", 4, d.height() - 2);

    d.setTextDatum(bottom_right);
    if (WiFi.status() == WL_CONNECTED) {
        d.setTextColor(TFT_DARKGREEN, TFT_BLACK);
        d.drawString("WiFi", d.width() - 4, d.height() - 2);
    } else {
        d.setTextColor(TFT_MAROON, TFT_BLACK);
        d.drawString("WiFi?", d.width() - 4, d.height() - 2);
    }
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

    syncNtp();
}

}  // namespace

void setup() {
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
        auto st = M5Cardputer.Keyboard.keysState();
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
        (void)st;
    }

    if (timeSynced && millis() - lastResync > kNtpResyncIntervalMs) {
        if (WiFi.status() != WL_CONNECTED) {
            connectWifi();
        }
        syncNtp();
        lastDrawnSecond = -1;
    }

    struct tm ti {};
    if (getLocalTime(&ti, 0)) {
        if (ti.tm_sec != lastDrawnSecond) {
            lastDrawnSecond = ti.tm_sec;
            drawClock(ti);
        }
    } else {
        drawStatus("Waiting for time", "press R to sync");
        delay(500);
    }

    delay(20);
}
