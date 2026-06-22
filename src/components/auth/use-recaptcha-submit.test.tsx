import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

import { useRecaptchaSubmit } from "@/components/auth/use-recaptcha-submit";

// Control the reCAPTCHA token resolution so we can interleave a field mutation
// between the submit gesture and the async token resolution (the WebKit autofill
// race this hook guards against).
let resolveToken: (token: string | null) => void;
let executeMock: ReturnType<typeof vi.fn>;

vi.mock("@/components/auth/use-recaptcha", () => ({
  useRecaptcha: () => ({ enabled: true, execute: executeMock }),
}));

function Harness({ onAction }: { onAction: (form: FormData) => void }) {
  const onSubmit = useRecaptchaSubmit("login", onAction);
  return (
    <form onSubmit={onSubmit}>
      <input name="email" defaultValue="user@example.com" aria-label="email" />
      <input name="password" defaultValue="s3cret-pass" aria-label="password" />
      <button type="submit">submit</button>
    </form>
  );
}

describe("useRecaptchaSubmit", () => {
  beforeEach(() => {
    executeMock = vi.fn(
      () =>
        new Promise<string | null>((resolve) => {
          resolveToken = resolve;
        }),
    );
  });

  it("captures form fields synchronously, before the async reCAPTCHA resolves", async () => {
    const onAction = vi.fn<(form: FormData) => void>();
    render(<Harness onAction={onAction} />);

    fireEvent.click(screen.getByRole("button", { name: "submit" }));

    // Simulate the form fields becoming unreadable AFTER the gesture — this is
    // what Safari/iOS does with autofilled credentials once we leave the
    // user-gesture context. If FormData were read here it would be empty.
    const email = screen.getByLabelText("email") as HTMLInputElement;
    const password = screen.getByLabelText("password") as HTMLInputElement;
    email.value = "";
    password.value = "";

    // Now resolve reCAPTCHA → the action dispatches with the SNAPSHOTTED values.
    resolveToken("v3-token");
    await vi.waitFor(() => expect(onAction).toHaveBeenCalledTimes(1));

    const data = onAction.mock.calls[0]![0]!;
    expect(data.get("email")).toBe("user@example.com");
    expect(data.get("password")).toBe("s3cret-pass");
    expect(data.get("recaptchaToken")).toBe("v3-token");
  });
});
