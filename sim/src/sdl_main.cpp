#include <M5GFX.h>
#if defined(SDL_h_)

void setup(void);
void loop(void);

__attribute__((weak)) int user_func(bool* running) {
    setup();
    do {
        loop();
    } while (*running);
    return 0;
}

int main(int, char**) {
    // Second arg: frame pacing for SDL panel redraw (ms).
    return lgfx::Panel_sdl::main(user_func, 64);
}

#endif
