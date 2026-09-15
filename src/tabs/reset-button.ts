/**
 * Two-click confirmation for destructive buttons. The app runs in contexts
 * where a native confirm() is unreliable, and a second tap is faster than a
 * dialog anyway.
 */
export function armReset(btn: HTMLButtonElement, label: string, onConfirm: () => void): void {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const disarm = () => {
    armed = false;
    btn.textContent = label;
    btn.classList.remove("armed");
    if (timer) clearTimeout(timer);
  };

  btn.addEventListener("click", () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Ste prepričani?";
      btn.classList.add("armed");
      timer = setTimeout(disarm, 3000);
      return;
    }
    disarm();
    onConfirm();
  });
}
