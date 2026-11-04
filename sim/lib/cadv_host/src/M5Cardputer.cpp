#include "M5Cardputer.h"

#include <SDL.h>

using namespace m5;

M5_CARDPUTER M5Cardputer;

namespace {

char mapKey(SDL_Scancode sc, bool shift) {
    // Printable ASCII + a few controls for the firmware prompt / hotkeys.
    switch (sc) {
        case SDL_SCANCODE_RETURN:
        case SDL_SCANCODE_KP_ENTER:
            return '\n';
        case SDL_SCANCODE_BACKSPACE:
            return '\b';
        case SDL_SCANCODE_SPACE:
            return ' ';
        case SDL_SCANCODE_MINUS:
            return shift ? '_' : '-';
        case SDL_SCANCODE_EQUALS:
            return shift ? '+' : '=';
        case SDL_SCANCODE_LEFTBRACKET:
            return shift ? '{' : '[';
        case SDL_SCANCODE_RIGHTBRACKET:
            return shift ? '}' : ']';
        case SDL_SCANCODE_BACKSLASH:
            return shift ? '|' : '\\';
        case SDL_SCANCODE_SEMICOLON:
            return shift ? ':' : ';';
        case SDL_SCANCODE_APOSTROPHE:
            return shift ? '"' : '\'';
        case SDL_SCANCODE_COMMA:
            return shift ? '<' : ',';
        case SDL_SCANCODE_PERIOD:
            return shift ? '>' : '.';
        case SDL_SCANCODE_SLASH:
            return shift ? '?' : '/';
        case SDL_SCANCODE_GRAVE:
            return shift ? '~' : '`';
        default:
            break;
    }
    if (sc >= SDL_SCANCODE_A && sc <= SDL_SCANCODE_Z) {
        const char base = static_cast<char>('a' + (sc - SDL_SCANCODE_A));
        return shift ? static_cast<char>(base - 'a' + 'A') : base;
    }
    if (sc >= SDL_SCANCODE_1 && sc <= SDL_SCANCODE_0) {
        static const char* unshifted = "1234567890";
        static const char* shifted   = "!@#$%^&*()";
        const int idx = (sc == SDL_SCANCODE_0) ? 9 : (sc - SDL_SCANCODE_1);
        return shift ? shifted[idx] : unshifted[idx];
    }
    return 0;
}

}  // namespace

void M5_CARDPUTER::begin(bool enableKeyboard) {
    M5.begin();
    _enableKeyboard = enableKeyboard;
    if (enableKeyboard) {
        Keyboard.begin();
    }
}

void M5_CARDPUTER::begin(m5::M5Unified::config_t cfg, bool enableKeyboard) {
    M5.begin(cfg);
    _enableKeyboard = enableKeyboard;
    if (enableKeyboard) {
        Keyboard.begin();
    }
}

void M5_CARDPUTER::update(void) {
    M5.update();
    if (_enableKeyboard) {
        Keyboard.updateKeyList();
        Keyboard.updateKeysState();
    }
}

void Keyboard_Class::updateKeyList() {
    // State is rebuilt in updateKeysState from SDL_GetKeyboardState.
}

void Keyboard_Class::updateKeysState() {
    _keys_state.reset();
    _pressed_count = 0;

    if (!SDL_WasInit(SDL_INIT_VIDEO)) {
        return;
    }

    int n = 0;
    const Uint8* state = SDL_GetKeyboardState(&n);
    if (!state || n <= 0) {
        return;
    }

    const bool shift = state[SDL_SCANCODE_LSHIFT] || state[SDL_SCANCODE_RSHIFT];
    const int limit  = n < 512 ? n : 512;

    for (int sc = 0; sc < limit; ++sc) {
        if (!state[sc]) {
            _edge_seen[sc] = false;
            continue;
        }
        if (_edge_seen[sc]) {
            // Held — still "pressed" for isKeyPressed / isPressed, no repeat chars.
            const char ch = mapKey(static_cast<SDL_Scancode>(sc), shift);
            if (ch == '\n') {
                _keys_state.enter = true;
                ++_pressed_count;
            } else if (ch == '\b') {
                _keys_state.del = true;
                ++_pressed_count;
            } else if (ch != 0) {
                ++_pressed_count;
            }
            continue;
        }
        _edge_seen[sc] = true;

        const char ch = mapKey(static_cast<SDL_Scancode>(sc), shift);
        if (ch == 0) {
            continue;
        }
        if (ch == '\n') {
            _keys_state.enter = true;
            ++_pressed_count;
        } else if (ch == '\b') {
            _keys_state.del = true;
            ++_pressed_count;
        } else {
            _keys_state.word.push_back(ch);
            if (ch == ' ') {
                _keys_state.space = true;
            }
            ++_pressed_count;
        }
    }
}

uint8_t Keyboard_Class::isPressed() {
    return _pressed_count;
}

bool Keyboard_Class::isChange() {
    if (_last_key_size != _pressed_count) {
        _last_key_size = _pressed_count;
        return true;
    }
    return false;
}

bool Keyboard_Class::isKeyPressed(char c) {
    if (c == '\n' || c == '\r') {
        return _keys_state.enter;
    }
    if (c == '\b') {
        return _keys_state.del;
    }
    for (char ch : _keys_state.word) {
        if (ch == c) {
            return true;
        }
    }
    // Held keys still count for hotkeys (R / W / C) even after edge latch.
    if (!SDL_WasInit(SDL_INIT_VIDEO)) {
        return false;
    }
    int n = 0;
    const Uint8* state = SDL_GetKeyboardState(&n);
    if (!state) {
        return false;
    }
    const bool shift = state[SDL_SCANCODE_LSHIFT] || state[SDL_SCANCODE_RSHIFT];
    const int limit  = n < 512 ? n : 512;
    for (int sc = 0; sc < limit; ++sc) {
        if (!state[sc]) {
            continue;
        }
        if (mapKey(static_cast<SDL_Scancode>(sc), shift) == c) {
            return true;
        }
    }
    return false;
}
