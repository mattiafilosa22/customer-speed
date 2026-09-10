import { describe, expect, it } from "vitest";

import { ChatChannel } from "@/generated/prisma/enums";
import { channelGroupOf, OUTBOUND_CHANNELS } from "@/server/insight/channels";

describe("channelGroupOf", () => {
  it("collapses both outbound channels into a single column group", () => {
    expect(channelGroupOf(ChatChannel.OUTBOUND_COMMENT)).toBe("outbound");
    expect(channelGroupOf(ChatChannel.OUTBOUND_STORY)).toBe("outbound");
  });

  it("keeps welcome and inbound on their own", () => {
    expect(channelGroupOf(ChatChannel.WELCOME)).toBe("welcome");
    expect(channelGroupOf(ChatChannel.INBOUND)).toBe("inbound");
  });

  it("lists exactly the channels that belong to the outbound group", () => {
    expect([...OUTBOUND_CHANNELS]).toEqual([
      ChatChannel.OUTBOUND_COMMENT,
      ChatChannel.OUTBOUND_STORY,
    ]);
  });
});
