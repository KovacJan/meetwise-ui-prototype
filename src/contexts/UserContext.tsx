"use client";

import {createContext, useContext, useState} from "react";
import type {ReactNode} from "react";

export type UserPlan = "free" | "pro";

export interface UserContextValue {
  displayName: string | null;
  email: string | null;
  /** Two-letter initials derived from displayName or email */
  initials: string;
  /** Team subscription plan */
  plan: UserPlan;
  /** Client-side override for plan so UI can react immediately to upgrades/downgrades */
  setPlan: (plan: UserPlan) => void;
}

const UserContext = createContext<UserContextValue>({
  displayName: null,
  email: null,
  initials: "?",
  plan: "free",
  setPlan: () => {},
});

function getInitials(name: string | null, email: string | null): string {
  if (name?.trim()) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.trim().slice(0, 2).toUpperCase();
  }
  if (email) return email.slice(0, 2).toUpperCase();
  return "?";
}

export function UserProvider({
  children,
  displayName,
  email,
  plan = "free",
}: {
  children: ReactNode;
  displayName: string | null;
  email: string | null;
  plan?: UserPlan;
}) {
  const [planState, setPlanState] = useState<UserPlan>(plan);

  return (
    <UserContext.Provider
      value={{
        displayName,
        email,
        initials: getInitials(displayName, email),
        plan: planState,
        setPlan: setPlanState,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser(): UserContextValue {
  return useContext(UserContext);
}
