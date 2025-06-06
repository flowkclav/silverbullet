import { type Diagnostic, linter } from "@codemirror/lint";
import type { Client } from "../client.ts";
import { parse } from "../markdown_parser/parse_tree.ts";
import type { LintEvent } from "../../plug-api/types.ts";
import { extendedMarkdownLanguage } from "../markdown_parser/parser.ts";

export function plugLinter(client: Client) {
  return linter(async (view): Promise<Diagnostic[]> => {
    const tree = parse(
      extendedMarkdownLanguage,
      view.state.sliceDoc(),
    );
    const results = (await client.dispatchAppEvent("editor:lint", {
      name: client.currentPage,
      tree: tree,
    } as LintEvent)).flat();
    return results;
  });
}
