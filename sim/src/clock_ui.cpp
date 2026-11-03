/**
 * Host-side SDL preview of the Cardputer clock face.
 * Uses wall-clock time from the Mac — no Wi-Fi / NTP / keyboard I2C.
 */
#include <M5Unified.h>
#include <ctime>

namespace {

const char* const kWeekday[] = {"Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"};
int lastDrawnSecond = -1;

void drawStatus(const char* line1, const char* line2 = nullptr) {
    auto& d = M5.Display;
    d.fillScreen(TFT_BLACK);
    d.setTextDatum(middle_center);
    d.setTextColor(TFT_YELLOW, TFT_BLACK);
    d.setFont(&fonts::FreeSansBold12pt7b);
    d.setTextSize(1.0f);
    d.drawString(line1, d.width() / 2, d.height() / 2 - (line2 ? 16 : 0));
    if (line2) {
        d.setTextColor(TFT_LIGHTGREY, TFT_BLACK);
        d.setFont(&fonts::FreeSansBold9pt7b);
        d.drawString(line2, d.width() / 2, d.height() / 2 + 18);
    }
}

void drawClock(const tm& ti) {
    auto& d = M5.Display;
    char timeBuf[16];
    char dateBuf[32];
    snprintf(timeBuf, sizeof(timeBuf), "%02d:%02d:%02d", ti.tm_hour, ti.tm_min, ti.tm_sec);
    snprintf(dateBuf, sizeof(dateBuf), "%04d-%02d-%02d  %s", ti.tm_year + 1900, ti.tm_mon + 1,
             ti.tm_mday, kWeekday[ti.tm_wday]);

    d.fillScreen(TFT_BLACK);

    d.setTextDatum(middle_center);
    d.setTextColor(TFT_WHITE, TFT_BLACK);
    d.setFont(&fonts::FreeSansBold24pt7b);
    d.setTextSize(1.0f);
    d.drawString(timeBuf, d.width() / 2, d.height() / 2 - 6);

    d.setFont(&fonts::FreeSansBold9pt7b);
    d.setTextColor(TFT_CYAN, TFT_BLACK);
    d.drawString(dateBuf, d.width() / 2, d.height() / 2 + 38);

    d.setTextDatum(bottom_left);
    d.setTextColor(TFT_DARKGREY, TFT_BLACK);
    d.setFont(&fonts::Font0);
    d.drawString("SIM", 4, d.height() - 2);

    d.setTextDatum(bottom_right);
    d.setTextColor(TFT_DARKGREEN, TFT_BLACK);
    d.drawString("HOST", d.width() - 4, d.height() - 2);
}

}  // namespace

void setup(void) {
    auto cfg = M5.config();
    M5.begin(cfg);
    M5.Display.setBrightness(128);

    drawStatus("Cardputer Clock", "SDL simulator");
    M5.delay(700);
    lastDrawnSecond = -1;
}

void loop(void) {
    M5.update();

    time_t now = time(nullptr);
    struct tm ti {};
    localtime_r(&now, &ti);

    if (ti.tm_sec != lastDrawnSecond) {
        lastDrawnSecond = ti.tm_sec;
        drawClock(ti);
    }
    M5.delay(20);
}
