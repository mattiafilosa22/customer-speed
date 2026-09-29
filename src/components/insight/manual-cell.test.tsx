import type { ReactNode } from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { day } from "@/components/insight/test-fixtures";
import { ManualCell, useDayDraft, type ManualField } from "@/components/insight/manual-cell";
import type { MonthDayRow } from "@/server/insight";
import { saveActivityDayAction } from "@/app/[locale]/(app)/insight/actions";

vi.mock("@/app/[locale]/(app)/insight/actions", () => ({
  saveActivityDayAction: vi.fn(),
}));

function renderIntl(node: ReactNode) {
  return render(
    <NextIntlClientProvider locale="it" messages={itMessages}>
      {node}
    </NextIntlClientProvider>,
  );
}

const mockedSave = vi.mocked(saveActivityDayAction);

function ReadOnly() {
  const draft = useDayDraft(day("2026-09-05"));
  return <ManualCell draft={draft} field="welcomeSent" label="Welcome inviati" editable={false} />;
}

/** Mirrors a table row: several cells sharing one day draft. */
function Day({ row, fields }: { row: MonthDayRow; fields: readonly [ManualField, string][] }) {
  const draft = useDayDraft(row);
  return <>{fields.map(([field, label]) => <ManualCell key={field} draft={draft} field={field} label={label} editable />)}</>;
}

describe("ManualCell", () => {
  beforeEach(() => mockedSave.mockReset());

  it("renders a plain value, not an input, when the row is not editable", () => {
    renderIntl(
      <ReadOnly />,
    );
    expect(screen.queryByRole("spinbutton")).toBeNull();
  });

  it("saves on blur and clears any previous error", async () => {
    mockedSave.mockResolvedValueOnce({ status: "success" });
    renderIntl(
      <Day row={day("2026-09-05")} fields={[["welcomeSent", "Welcome inviati"]]} />,
    );

    const input = screen.getByRole("spinbutton", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a save error, associated with the field via aria-describedby", async () => {
    mockedSave.mockResolvedValueOnce({
      status: "error",
      fieldErrors: { welcomeSent: "insight.errors.repliesExceedWelcome" },
    });
    renderIntl(
      <Day row={day("2026-09-05")} fields={[["welcomeSent", "Welcome inviati"]]} />,
    );

    const input = screen.getByRole("spinbutton", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    const alert = await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("saves with the sibling cells' current values, not the stale server row", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["outboundComments", "Commenti"], ["outboundReplies", "Risposte"]]} />);

    const comments = screen.getByRole("spinbutton", { name: /commenti/i });
    fireEvent.change(comments, { target: { value: "3" } });
    fireEvent.blur(comments);
    const replies = screen.getByRole("spinbutton", { name: /risposte/i });
    fireEvent.change(replies, { target: { value: "2" } });
    fireEvent.blur(replies);

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2));
    const form = mockedSave.mock.calls[1]![1];
    expect(form.get("outboundComments")).toBe("3");
    expect(form.get("outboundReplies")).toBe("2");
  });

  it("clears a sibling's error once the day saves successfully", async () => {
    mockedSave
      .mockResolvedValueOnce({ status: "error", fieldErrors: { welcomeReplies: "insight.errors.repliesExceedWelcome" } })
      .mockResolvedValueOnce({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);

    const replies = screen.getByRole("spinbutton", { name: /risposte/i });
    fireEvent.change(replies, { target: { value: "1" } });
    fireEvent.blur(replies);
    expect(await screen.findByRole("alert")).toHaveTextContent(/non possono superare/i);

    const sent = screen.getByRole("spinbutton", { name: /inviati/i });
    fireEvent.change(sent, { target: { value: "4" } });
    fireEvent.blur(sent);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mockedSave.mock.calls[1]![1].get("welcomeReplies")).toBe("1");
  });
});
