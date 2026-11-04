#pragma once

#include "Arduino.h"

class IPAddress {
public:
    IPAddress() : _ok(false) {
        _octets[0] = _octets[1] = _octets[2] = _octets[3] = 0;
    }
    IPAddress(uint8_t a, uint8_t b, uint8_t c, uint8_t d) : _ok(true) {
        _octets[0] = a;
        _octets[1] = b;
        _octets[2] = c;
        _octets[3] = d;
    }

    explicit operator bool() const {
        return _ok && (_octets[0] | _octets[1] | _octets[2] | _octets[3]) != 0;
    }

    String toString() const {
        char buf[16];
        snprintf(buf, sizeof(buf), "%u.%u.%u.%u", _octets[0], _octets[1], _octets[2], _octets[3]);
        return String(buf);
    }

    void set(uint8_t a, uint8_t b, uint8_t c, uint8_t d) {
        _octets[0] = a;
        _octets[1] = b;
        _octets[2] = c;
        _octets[3] = d;
        _ok = true;
    }

private:
    uint8_t _octets[4];
    bool _ok;
};
