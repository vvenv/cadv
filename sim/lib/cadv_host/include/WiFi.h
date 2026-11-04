#pragma once

#include "IPAddress.h"

enum wl_status_t {
    WL_IDLE_STATUS      = 0,
    WL_NO_SSID_AVAIL    = 1,
    WL_SCAN_COMPLETED   = 2,
    WL_CONNECTED        = 3,
    WL_CONNECT_FAILED   = 4,
    WL_CONNECTION_LOST  = 5,
    WL_DISCONNECTED     = 6,
};

enum wifi_mode_t {
    WIFI_OFF  = 0,
    WIFI_STA  = 1,
    WIFI_AP   = 2,
    WIFI_AP_STA = 3,
};

class WiFiClass {
public:
    void mode(wifi_mode_t) {}
    void disconnect(bool = false, bool = false) {
        _status = WL_DISCONNECTED;
    }
    bool begin(const char* /*ssid*/, const char* /*pass*/ = nullptr) {
        _status = WL_CONNECTED;
        _ip.set(127, 0, 0, 1);
        return true;
    }
    wl_status_t status() const {
        return _status;
    }
    IPAddress localIP() const {
        return _ip;
    }
    bool hostByName(const char* /*host*/, IPAddress& ip) {
        ip.set(1, 1, 1, 1);
        return true;
    }

private:
    wl_status_t _status = WL_DISCONNECTED;
    IPAddress _ip;
};

extern WiFiClass WiFi;
