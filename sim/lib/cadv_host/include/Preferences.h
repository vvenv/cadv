#pragma once

#include "Arduino.h"
#include <map>

// File-backed key/value store so sim Wi-Fi credentials survive restarts.
class Preferences {
public:
    bool begin(const char* name, bool readOnly = false);
    void end();
    String getString(const char* key, const char* defaultValue = "");
    size_t putString(const char* key, const char* value);
    size_t putString(const char* key, const String& value) {
        return putString(key, value.c_str());
    }

private:
    void load();
    void save() const;
    std::string pathFor(const char* name) const;

    std::string _ns;
    bool _ro = false;
    bool _open = false;
    std::map<std::string, std::string> _kv;
};
