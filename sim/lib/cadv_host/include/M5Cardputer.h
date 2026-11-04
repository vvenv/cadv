#pragma once

#include <M5Unified.h>
#include <vector>

// Host stand-in for m5stack/M5Cardputer: same Display/begin/update surface,
// keyboard fed from the Mac keyboard via SDL (no I2C matrix / TCA8418).

class Keyboard_Class {
public:
    struct KeysState {
        bool tab   = false;
        bool fn    = false;
        bool shift = false;
        bool ctrl  = false;
        bool opt   = false;
        bool alt   = false;
        bool del   = false;
        bool enter = false;
        bool space = false;
        std::vector<char> word;

        void reset() {
            tab = fn = shift = ctrl = opt = alt = del = enter = space = false;
            word.clear();
        }
    };

    void begin() {}
    void updateKeyList();
    void updateKeysState();
    uint8_t isPressed();
    bool isChange();
    bool isKeyPressed(char c);
    KeysState& keysState() {
        return _keys_state;
    }

private:
    KeysState _keys_state;
    uint8_t _pressed_count = 0;
    uint8_t _last_key_size = 0;
    // Rising-edge latch so each physical press yields one character once.
    bool _edge_seen[512]{};
};

namespace m5 {

class M5_CARDPUTER {
public:
    void begin(bool enableKeyboard = true);
    void begin(m5::M5Unified::config_t cfg, bool enableKeyboard = true);

    M5GFX& Display = M5.Display;
    M5GFX& Lcd     = Display;

    Keyboard_Class Keyboard;

    void update(void);

private:
    bool _enableKeyboard = true;
};

}  // namespace m5

extern m5::M5_CARDPUTER M5Cardputer;
