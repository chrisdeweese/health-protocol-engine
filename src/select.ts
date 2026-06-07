import { evaluateCondition } from "./conditions.js";
import type { InterventionLibrary } from "./library.js";
import { CategorySchema, UserProfileSchema } from "./schemas.js";
import type { Category, Protocol, UserProfileInput } from "./schemas.js";

export type ProtocolSelectionOptions = {
  ids?: string[];
  categories?: Category[];
  idPrefixes?: string[];
  profile?: UserProfileInput;
  applicableOnly?: boolean;
  include?: (protocol: Protocol) => boolean;
};

export function selectProtocols(
  library: InterventionLibrary,
  {
    ids,
    categories,
    idPrefixes,
    profile: rawProfile,
    applicableOnly = rawProfile !== undefined,
    include
  }: ProtocolSelectionOptions = {}
): Protocol[] {
  if (applicableOnly && rawProfile === undefined) {
    throw new Error("selectProtocols requires options.profile when applicableOnly is true");
  }

  const selectedCategories = categories?.map((category) => CategorySchema.parse(category));
  const profile = rawProfile ? UserProfileSchema.parse(rawProfile) : undefined;
  const protocols = ids ? requireProtocols(library, ids) : library.allProtocols();

  return protocols.filter((protocol) => {
    if (selectedCategories && !selectedCategories.includes(protocol.category)) {
      return false;
    }

    if (idPrefixes && !idPrefixes.some((prefix) => protocol.id.startsWith(prefix))) {
      return false;
    }

    if (include && !include(protocol)) {
      return false;
    }

    return !profile || !applicableOnly || evaluateCondition(protocol.applies_when, profile);
  });
}

function requireProtocols(library: InterventionLibrary, ids: string[]): Protocol[] {
  return ids.map((id) => {
    const protocol = library.getProtocol(id);
    if (!protocol) {
      throw new Error(`Missing protocol "${id}"`);
    }
    return protocol;
  });
}
