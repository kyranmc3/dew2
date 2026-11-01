"use client";

import Link from "next/link";
import { useMenu } from "./useMenu";

export default function AccountMenu() {
  const { open, setOpen, wrapRef, buttonRef } = useMenu();
  return (
    <div className="more-wrap" ref={wrapRef}>
      <button ref={buttonRef} type="button" className="icon-btn" id="account" aria-label="Account" title="Account" aria-expanded={open} aria-controls="account-menu" onClick={() => setOpen(!open)}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      </button>
      {open && (
        <div className="menu" id="account-menu">
          <Link href="/settings" className="menu-item" id="open-settings">
            Settings
          </Link>
          <Link href="/past-weeks" className="menu-item" id="open-past-weeks">
            Past Weeks
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" id="log-out">
              Log out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
