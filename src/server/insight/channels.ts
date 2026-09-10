import { ChatChannel } from "@/generated/prisma/enums";

/**
 * Mappa fra i quattro canali salvati sul lead e le TRE colonne della tabella.
 *
 * Commento e storia sono canali distinti sul lead (il dato fine non si butta) ma
 * condividono le colonne Appuntamenti/Vendite: la tabella riproduce il blocco
 * "Outbound" del foglio, che ha una sola coppia di colonne a valle.
 */
export type ChannelGroup = "welcome" | "outbound" | "inbound";

export const OUTBOUND_CHANNELS: readonly ChatChannel[] = [
  ChatChannel.OUTBOUND_COMMENT,
  ChatChannel.OUTBOUND_STORY,
];

export function channelGroupOf(channel: ChatChannel): ChannelGroup {
  switch (channel) {
    case ChatChannel.WELCOME:
      return "welcome";
    case ChatChannel.OUTBOUND_COMMENT:
    case ChatChannel.OUTBOUND_STORY:
      return "outbound";
    case ChatChannel.INBOUND:
      return "inbound";
  }
}
