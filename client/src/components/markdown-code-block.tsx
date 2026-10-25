import type { CSSProperties } from "react";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism";
import base16AteliersulphurpoolLight from "react-syntax-highlighter/dist/esm/styles/prism/base16-ateliersulphurpool.light";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";

export default function MarkdownCodeBlock({ children, language, colorMode, codeStyle }: {
  children: string;
  language: string;
  colorMode: string;
  codeStyle: CSSProperties;
}) {
  return (
    <SyntaxHighlighter
      PreTag="div"
      className="rounded"
      language={language}
      style={colorMode === "dark" ? vscDarkPlus : base16AteliersulphurpoolLight}
      wrapLongLines
      codeTagProps={{ style: codeStyle }}
    >
      {children}
    </SyntaxHighlighter>
  );
}
