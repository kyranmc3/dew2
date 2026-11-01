"use client";

import { useMenu } from "./useMenu";

export default function MoreMenu({ onSkip, onReset }: { onSkip: () => void; onReset: () => void }) {
  const { open, setOpen, wrapRef, buttonRef } = useMenu();
  const choose = (action: () => void) => () => {
    setOpen(false);
    action();
  };
  return (
    <div className="more-wrap" ref={wrapRef}>
      <button ref={buttonRef} type="button" className="icon-btn more" id="more" aria-label="More options" aria-expanded={open} aria-controls="more-menu" onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="5" cy="12" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="19" cy="12" r="2" />
        </svg>
      </button>
      {open && (
        <div className="menu" id="more-menu">
          <button type="button" id="skip-week" onClick={choose(onSkip)}>
            Skip this week
          </button>
          <button type="button" id="reset-choices" onClick={choose(onReset)}>
            Reset Choices
          </button>
        </div>
      )}
    </div>
  );
}
