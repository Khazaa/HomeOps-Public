const CTRL_KEYS = new Set([0xffe3, 0xffe4]);
const V_KEY = 0x76;

export class RemoteKeyboardController {
  private readonly pressed = new Set<number>();
  private readonly nativeKeys = new Set<number>();

  constructor(private readonly client: any) {}

  keyDown(key: number) {
    const nativePaste = key === V_KEY && [...CTRL_KEYS].some(ctrl => this.pressed.has(ctrl));
    this.pressed.add(key);
    if (nativePaste) {
      this.nativeKeys.add(key);
      return true;
    }
    this.client.sendKeyEvent(1, key);
    return false;
  }

  keyUp(key: number) {
    this.pressed.delete(key);
    if (this.nativeKeys.delete(key)) return true;
    this.client.sendKeyEvent(0, key);
    return false;
  }
}
