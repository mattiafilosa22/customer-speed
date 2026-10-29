import type { ReactNode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import itMessages from "../../../messages/it.json";
import { day } from "@/components/insight/test-fixtures";
import { ManualCell, SAVE_DEBOUNCE_MS, SaveStatusText, useDayDraft, type ManualField } from "@/components/insight/manual-cell";
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

/** Mirrors a table row: several cells sharing one day draft, plus its save status. */
function Day({ row, fields }: { row: MonthDayRow; fields: readonly [ManualField, string][] }) {
  const draft = useDayDraft(row);
  return (
    <div data-insight-day>
      {fields.map(([field, label]) => <ManualCell key={field} draft={draft} field={field} label={label} editable />)}
      <SaveStatusText status={draft.status} />
    </div>
  );
}

/** Mirrors the table: several days stacked inside one navigable grid. */
function Grid({ rows, fields }: { rows: MonthDayRow[]; fields: readonly [ManualField, string][] }) {
  return <div data-insight-grid>{rows.map((row) => <Day key={row.date} row={row} fields={fields} />)}</div>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe("ManualCell", () => {
  beforeEach(() => mockedSave.mockReset());

  it("renders a plain value, not an input, when the row is not editable", () => {
    renderIntl(
      <ReadOnly />,
    );
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("saves on blur and clears any previous error", async () => {
    mockedSave.mockResolvedValueOnce({ status: "success" });
    renderIntl(
      <Day row={day("2026-09-05")} fields={[["welcomeSent", "Welcome inviati"]]} />,
    );

    const input = screen.getByRole("textbox", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.blur(input);

    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a save error, associated with the field via aria-describedby", async () => {
    mockedSave.mockResolvedValueOnce({
      status: "error",
      fieldErrors: { welcomeSent: "insight.errors.generic" },
    });
    renderIntl(
      <Day row={day("2026-09-05")} fields={[["welcomeSent", "Welcome inviati"]]} />,
    );

    const input = screen.getByRole("textbox", { name: /welcome inviati/i });
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.blur(input);

    const alert = await screen.findByRole("alert");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBe(alert.id);
  });

  it("saves with the sibling cells' current values, not the stale server row", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["outboundComments", "Commenti"], ["outboundReplies", "Risposte"]]} />);

    const comments = screen.getByRole("textbox", { name: /commenti/i });
    fireEvent.change(comments, { target: { value: "3" } });
    fireEvent.blur(comments);
    const replies = screen.getByRole("textbox", { name: /risposte/i });
    fireEvent.change(replies, { target: { value: "2" } });
    fireEvent.blur(replies);

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(2));
    const form = mockedSave.mock.calls[1]![1];
    expect(form.get("outboundComments")).toBe("3");
    expect(form.get("outboundReplies")).toBe("2");
  });

  it("forwards welcome replies above sent messages, including zero sent", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);

    const sent = screen.getByRole("textbox", { name: /inviati/i });
    fireEvent.change(sent, { target: { value: "0" } });
    fireEvent.blur(sent);
    const replies = screen.getByRole("textbox", { name: /risposte/i });
    fireEvent.change(replies, { target: { value: "5" } });
    fireEvent.blur(replies);

    await waitFor(() => expect(mockedSave).toHaveBeenCalledTimes(1));
    const form = mockedSave.mock.calls[0]![1];
    expect(form.get("welcomeSent")).toBe("0");
    expect(form.get("welcomeReplies")).toBe("5");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("clears a sibling's error once the day saves successfully", async () => {
    mockedSave
      .mockResolvedValueOnce({ status: "error", fieldErrors: { welcomeReplies: "insight.errors.generic" } })
      .mockResolvedValueOnce({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);

    const replies = screen.getByRole("textbox", { name: /risposte/i });
    fireEvent.change(replies, { target: { value: "1" } });
    fireEvent.blur(replies);
    expect(await screen.findByRole("alert")).toHaveTextContent(/non è stato possibile/i);

    const sent = screen.getByRole("textbox", { name: /inviati/i });
    fireEvent.change(sent, { target: { value: "4" } });
    fireEvent.blur(sent);

    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(mockedSave.mock.calls[1]![1].get("welcomeReplies")).toBe("1");
  });
});

describe("ManualCell input ergonomics", () => {
  beforeEach(() => mockedSave.mockReset());

  it("renders 16px+ tabular digits with a numeric keyboard and drops non-digits", () => {
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"]]} />);
    const input = screen.getByRole("textbox", { name: /inviati/i });

    expect(input).toHaveAttribute("inputmode", "numeric");
    expect(input).toHaveClass("text-base", "tabular-nums", "font-mono");
    fireEvent.change(input, { target: { value: "0a1-2" } });
    expect(input).toHaveValue("12");
    fireEvent.change(input, { target: { value: "" } });
    expect(input).toHaveValue("");
  });

  it("moves across the grid with the arrow keys, like a spreadsheet", () => {
    renderIntl(<Grid rows={[day("2026-09-05"), day("2026-09-06")]} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);
    const [sentDay5, sentDay6] = screen.getAllByRole("textbox", { name: /inviati/i });
    const [repliesDay5] = screen.getAllByRole("textbox", { name: /risposte/i });

    sentDay5!.focus();
    fireEvent.keyDown(sentDay5!, { key: "ArrowDown" });
    expect(sentDay6).toHaveFocus();
    fireEvent.keyDown(sentDay6!, { key: "ArrowUp" });
    expect(sentDay5).toHaveFocus();
    // Focus selects the whole value, so Right leaves the cell at once.
    fireEvent.keyDown(sentDay5!, { key: "ArrowRight" });
    expect(repliesDay5).toHaveFocus();
    fireEvent.keyDown(repliesDay5!, { key: "ArrowLeft" });
    expect(sentDay5).toHaveFocus();
  });

  it("keeps Left/Right inside the digits until the caret reaches the edge", () => {
    renderIntl(<Day row={day("2026-09-05", { welcome: { ...day("x").welcome, sent: 123 } })} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);
    const sent = screen.getByRole("textbox", { name: /inviati/i });
    sent.focus();
    (sent as HTMLInputElement).setSelectionRange(1, 1);

    fireEvent.keyDown(sent, { key: "ArrowRight" });
    expect(sent).toHaveFocus();
    (sent as HTMLInputElement).setSelectionRange(3, 3);
    fireEvent.keyDown(sent, { key: "ArrowRight" });
    expect(screen.getByRole("textbox", { name: /risposte/i })).toHaveFocus();
  });
});

describe("ManualCell saving", () => {
  beforeEach(() => {
    mockedSave.mockReset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it("waits for a pause in typing instead of saving on every keystroke", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"]]} />);
    const input = screen.getByRole("textbox", { name: /inviati/i });

    fireEvent.change(input, { target: { value: "1" } });
    fireEvent.change(input, { target: { value: "12" } });
    fireEvent.change(input, { target: { value: "123" } });
    expect(screen.getByRole("status")).toHaveTextContent("Modifiche non salvate");
    await act(async () => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS - 1));
    expect(mockedSave).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(1));
    expect(mockedSave).toHaveBeenCalledTimes(1);
    expect(mockedSave.mock.calls[0]![1].get("welcomeSent")).toBe("123");
    expect(screen.getByRole("status")).toHaveTextContent("Salvato");
  });

  it("saves at once on Enter and moves down, without a second save on blur", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Grid rows={[day("2026-09-05"), day("2026-09-06")]} fields={[["welcomeSent", "Inviati"]]} />);
    const [first, second] = screen.getAllByRole("textbox", { name: /inviati/i });

    first!.focus();
    fireEvent.change(first!, { target: { value: "7" } });
    await act(async () => {
      fireEvent.keyDown(first!, { key: "Enter" });
    });

    expect(second).toHaveFocus();
    await act(async () => vi.advanceTimersByTime(SAVE_DEBOUNCE_MS * 2));
    expect(mockedSave).toHaveBeenCalledTimes(1);
  });

  it("shows the saving state and sends edits typed meanwhile right after", async () => {
    const first = deferred<{ status: "success" }>();
    mockedSave.mockReturnValueOnce(first.promise).mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"], ["welcomeReplies", "Risposte"]]} />);
    const sent = screen.getByRole("textbox", { name: /inviati/i });
    const replies = screen.getByRole("textbox", { name: /risposte/i });

    fireEvent.change(sent, { target: { value: "4" } });
    fireEvent.blur(sent);
    expect(screen.getByRole("status")).toHaveTextContent("Salvataggio…");
    // Still editable while saving: focus never drops out of the grid.
    expect(replies).not.toBeDisabled();
    fireEvent.change(replies, { target: { value: "9" } });
    fireEvent.blur(replies);
    expect(mockedSave).toHaveBeenCalledTimes(1);

    await act(async () => first.resolve({ status: "success" }));
    expect(mockedSave).toHaveBeenCalledTimes(2);
    expect(mockedSave.mock.calls[1]![1].get("welcomeReplies")).toBe("9");
    expect(screen.getByRole("status")).toHaveTextContent("Salvato");
  });

  it("warns before unloading the page while changes are unsaved", async () => {
    mockedSave.mockResolvedValue({ status: "success" });
    renderIntl(<Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"]]} />);
    const input = screen.getByRole("textbox", { name: /inviati/i });
    const unload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(unload()).toBe(false);
    fireEvent.change(input, { target: { value: "5" } });
    expect(unload()).toBe(true);
    await act(async () => fireEvent.blur(input));
    expect(unload()).toBe(false);
  });

  it("asks before following an in-app link when a save failed", async () => {
    mockedSave.mockResolvedValue({ status: "error", formError: "insight.errors.generic" });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderIntl(
      <>
        <Day row={day("2026-09-05")} fields={[["welcomeSent", "Inviati"]]} />
        <a href="#lead">Lead</a>
      </>,
    );
    const input = screen.getByRole("textbox", { name: /inviati/i });

    fireEvent.change(input, { target: { value: "5" } });
    await act(async () => fireEvent.blur(input));
    expect(screen.getByRole("status")).toHaveTextContent("Salvataggio non riuscito");

    const click = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    screen.getByRole("link", { name: "Lead" }).dispatchEvent(click);
    expect(confirm).toHaveBeenCalledWith(expect.stringMatching(/non sono state salvate/i));
    expect(click.defaultPrevented).toBe(true);
    confirm.mockRestore();
  });
});
