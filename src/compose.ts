import { apply } from "./apply.js";
import { InterventionLibrary, loadLibrary } from "./library.js";
import { selectProtocols, type ProtocolSelectionOptions } from "./select.js";
import type { PersonalizedStack, Protocol, UserProfileInput } from "./schemas.js";

export type ComposeStackOptions = {
  library?: InterventionLibrary;
  libraryRoot?: string;
  protocols?: Protocol[];
  selection?: Omit<ProtocolSelectionOptions, "profile">;
};

export type ProtocolEngine = {
  readonly library: InterventionLibrary;
  composeStack(
    profile: UserProfileInput,
    options?: Omit<ComposeStackOptions, "library" | "libraryRoot">
  ): Promise<PersonalizedStack>;
  selectProtocols(profile: UserProfileInput, selection?: Omit<ProtocolSelectionOptions, "profile">): Protocol[];
};

export async function composeStack(profile: UserProfileInput, options: ComposeStackOptions = {}): Promise<PersonalizedStack> {
  if (options.library && options.libraryRoot) {
    throw new Error("composeStack accepts either options.library or options.libraryRoot, not both");
  }

  const library = options.library ?? (await loadLibrary(options.libraryRoot));
  const protocols =
    options.protocols ??
    selectProtocols(library, {
      ...options.selection,
      profile
    });

  return apply(protocols, profile, library);
}

export async function createProtocolEngine(
  options: Pick<ComposeStackOptions, "library" | "libraryRoot"> = {}
): Promise<ProtocolEngine> {
  if (options.library && options.libraryRoot) {
    throw new Error("createProtocolEngine accepts either options.library or options.libraryRoot, not both");
  }

  const library = options.library ?? (await loadLibrary(options.libraryRoot));

  return {
    library,
    async composeStack(profile, composeOptions = {}) {
      return composeStack(profile, {
        ...composeOptions,
        library
      });
    },
    selectProtocols(profile, selection = {}) {
      return selectProtocols(library, {
        ...selection,
        profile
      });
    }
  };
}
