import { useEffect } from "react";
import { render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useRecaptchaV2 } from "@/components/auth/use-recaptcha-v2";

/**
 * The v2 hook is the delicate part of the fallback: a SEPARATE explicit-render
 * script must coexist with v3 on `window.grecaptcha`, render exactly once, and
 * expose getResponse/reset. We drive it through a tiny probe component and a
 * fake `grecaptcha` so no real network/Google API is touched.
 */

interface RenderParams {
  sitekey: string;
}

function installFakeGrecaptcha() {
  const render = vi.fn((_el: HTMLElement, _params: RenderParams) => 7);
  const getResponse = vi.fn((_id?: number) => "v2-response-token");
  const reset = vi.fn();
  const ready = vi.fn((cb: () => void) => cb());
  window.grecaptcha = { render, getResponse, reset, ready };
  return { render, getResponse, reset, ready };
}

function Probe({
  active,
  onApi,
}: {
  active: boolean;
  onApi: (api: ReturnType<typeof useRecaptchaV2>) => void;
}) {
  const api = useRecaptchaV2(active);
  const { containerRef } = api;
  // Surface the hook API to the test from an effect (not during render), so the
  // react-hooks/refs lint rule (no ref access in render) stays happy.
  useEffect(() => {
    onApi(api);
  });
  return <div ref={containerRef} data-testid="v2-container" />;
}

const ENV_KEY = "NEXT_PUBLIC_RECAPTCHA_V2_SITE_KEY";

beforeEach(() => {
  process.env[ENV_KEY] = "v2-site-key";
});

afterEach(() => {
  delete process.env[ENV_KEY];
  // Remove any injected script + global between tests.
  document.getElementById("recaptcha-v2")?.remove();
  delete window.grecaptcha;
  vi.restoreAllMocks();
});

describe("useRecaptchaV2", () => {
  it("is disabled (renders nothing, no script) when no v2 site key is set", () => {
    delete process.env[ENV_KEY];
    let api: ReturnType<typeof useRecaptchaV2> | undefined;
    render(<Probe active onApi={(a) => (api = a)} />);
    expect(api?.enabled).toBe(false);
    expect(document.getElementById("recaptcha-v2")).toBeNull();
  });

  it("does NOT load the script while inactive (challenge not needed yet)", () => {
    render(<Probe active={false} onApi={() => {}} />);
    expect(document.getElementById("recaptcha-v2")).toBeNull();
  });

  it("loads the explicit-render script when the API is not yet present", () => {
    // No grecaptcha on window yet → the hook must inject the explicit script.
    render(<Probe active onApi={() => {}} />);
    const script = document.getElementById("recaptcha-v2") as HTMLScriptElement | null;
    expect(script).not.toBeNull();
    expect(script?.src).toContain("render=explicit");
  });

  it("renders the widget once when the API is available", async () => {
    const g = installFakeGrecaptcha();
    render(<Probe active onApi={() => {}} />);

    await waitFor(() => expect(g.render).toHaveBeenCalledTimes(1));
    expect(g.render).toHaveBeenCalledWith(
      expect.any(HTMLElement),
      expect.objectContaining({ sitekey: "v2-site-key" }),
    );
  });

  it("reads the widget token via getResponse and clears it via reset", async () => {
    const g = installFakeGrecaptcha();
    let api: ReturnType<typeof useRecaptchaV2> | undefined;
    render(<Probe active onApi={(a) => (api = a)} />);

    await waitFor(() => expect(g.render).toHaveBeenCalled());

    expect(api?.getResponse()).toBe("v2-response-token");
    api?.reset();
    expect(g.reset).toHaveBeenCalledWith(7);
  });

  it("getResponse returns null when the widget response is empty", async () => {
    const g = installFakeGrecaptcha();
    g.getResponse.mockReturnValue("");
    let api: ReturnType<typeof useRecaptchaV2> | undefined;
    render(<Probe active onApi={(a) => (api = a)} />);
    await waitFor(() => expect(g.render).toHaveBeenCalled());
    expect(api?.getResponse()).toBeNull();
  });
});
