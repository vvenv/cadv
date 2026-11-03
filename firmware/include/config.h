#pragma once

// Optional compile-time Wi-Fi. Leave empty to configure on-device via keyboard.
#ifndef WIFI_SSID
#define WIFI_SSID ""
#endif
#ifndef WIFI_PASSWORD
#define WIFI_PASSWORD ""
#endif

// POSIX TZ for China Standard Time (UTC+8, no DST)
#ifndef NTP_TIMEZONE
#define NTP_TIMEZONE "CST-8"
#endif

#ifndef NTP_SERVER1
#define NTP_SERVER1 "ntp.aliyun.com"
#endif
#ifndef NTP_SERVER2
#define NTP_SERVER2 "ntp.tencent.com"
#endif
#ifndef NTP_SERVER3
#define NTP_SERVER3 "pool.ntp.org"
#endif

static constexpr uint32_t kWifiConnectTimeoutMs = 20000;
static constexpr uint32_t kNtpWaitTimeoutMs     = 15000;
static constexpr uint32_t kNtpResyncIntervalMs  = 60UL * 60UL * 1000UL;
