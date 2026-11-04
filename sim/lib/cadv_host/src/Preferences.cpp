#include "Preferences.h"

#include <cstdio>
#include <fstream>
#include <sstream>

namespace {

constexpr const char* kPrefsDirEnv = "CADV_SIM_PREFS";

}  // namespace

std::string Preferences::pathFor(const char* name) const {
    const char* dir = std::getenv(kPrefsDirEnv);
    std::string base = dir && *dir ? dir : "/tmp";
    return base + "/cadv-sim-" + name + ".prefs";
}

bool Preferences::begin(const char* name, bool readOnly) {
    _ns   = name ? name : "default";
    _ro   = readOnly;
    _open = true;
    load();
    return true;
}

void Preferences::end() {
    if (_open && !_ro) {
        save();
    }
    _open = false;
    _kv.clear();
}

void Preferences::load() {
    _kv.clear();
    std::ifstream in(pathFor(_ns.c_str()));
    if (!in) {
        return;
    }
    std::string line;
    while (std::getline(in, line)) {
        const auto eq = line.find('=');
        if (eq == std::string::npos) {
            continue;
        }
        _kv[line.substr(0, eq)] = line.substr(eq + 1);
    }
}

void Preferences::save() const {
    std::ofstream out(pathFor(_ns.c_str()), std::ios::trunc);
    if (!out) {
        return;
    }
    for (const auto& kv : _kv) {
        out << kv.first << '=' << kv.second << '\n';
    }
}

String Preferences::getString(const char* key, const char* defaultValue) {
    if (!key) {
        return String(defaultValue ? defaultValue : "");
    }
    const auto it = _kv.find(key);
    if (it == _kv.end()) {
        return String(defaultValue ? defaultValue : "");
    }
    return String(it->second);
}

size_t Preferences::putString(const char* key, const char* value) {
    if (!_open || _ro || !key) {
        return 0;
    }
    const char* v = value ? value : "";
    _kv[key]      = v;
    save();
    return std::strlen(v);
}
