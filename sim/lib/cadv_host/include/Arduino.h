#pragma once

// Minimal Arduino surface for compiling firmware under M5GFX SDL (native).

#include <cctype>
#include <cstdarg>
#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <string>

#include <M5GFX.h>

using std::size_t;

#ifndef HIGH
#define HIGH 0x1
#define LOW 0x0
#endif

inline unsigned long millis(void) {
    return lgfx::millis();
}

inline void delay(unsigned long ms) {
    lgfx::delay(ms);
}

class String {
public:
    String() = default;
    String(const char* s) : _s(s ? s : "") {}
    String(const std::string& s) : _s(s) {}
    String(const String&) = default;
    String& operator=(const String&) = default;
    String& operator=(const char* s) {
        _s = s ? s : "";
        return *this;
    }

    String& operator+=(char c) {
        _s.push_back(c);
        return *this;
    }
    String& operator+=(const char* s) {
        if (s) {
            _s += s;
        }
        return *this;
    }
    String& operator+=(const String& o) {
        _s += o._s;
        return *this;
    }

    friend String operator+(const String& a, const char* b) {
        return String(a._s + (b ? b : ""));
    }
    friend String operator+(const String& a, const String& b) {
        return String(a._s + b._s);
    }

    unsigned int length() const {
        return static_cast<unsigned int>(_s.size());
    }
    bool isEmpty() const {
        return _s.empty();
    }
    const char* c_str() const {
        return _s.c_str();
    }
    operator const char*() const {
        return _s.c_str();
    }
    void reserve(unsigned int n) {
        _s.reserve(n);
    }
    // Arduino: remove from index through end.
    void remove(unsigned int index) {
        if (index < _s.size()) {
            _s.erase(index);
        }
    }

private:
    std::string _s;
};

class HardwareSerial {
public:
    void begin(unsigned long) {}
    void println(const char* s) {
        std::puts(s);
    }
    void println(const String& s) {
        std::puts(s.c_str());
    }
    int printf(const char* fmt, ...) {
        va_list ap;
        va_start(ap, fmt);
        const int n = std::vprintf(fmt, ap);
        va_end(ap);
        return n;
    }
};

extern HardwareSerial Serial;

// ESP32 Arduino time helpers — on host, use wall clock (NTP servers ignored).
inline void configTzTime(const char* tz, const char* /*ntp1*/, const char* /*ntp2*/ = nullptr,
                         const char* /*ntp3*/ = nullptr) {
    if (tz && *tz) {
        setenv("TZ", tz, 1);
        tzset();
    }
}

inline bool getLocalTime(struct tm* info, uint32_t /*timeout_ms*/ = 5000) {
    if (!info) {
        return false;
    }
    const time_t now = time(nullptr);
    return localtime_r(&now, info) != nullptr;
}
