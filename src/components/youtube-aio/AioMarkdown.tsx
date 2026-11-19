import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Element, Root } from "hast";

export function AioMarkdown({ text, sources = [], ownSources = [] }: { text: string; sources?: number[]; ownSources?: number[] }) {
  function citationPlugin() {
    return (tree: Root) => {
      if (!sources.length) return;
      const citation: Element = {
        type: "element", tagName: "sup", properties: { className: ["ml-1", "text-[10px]", "font-semibold", "text-neutral-500", "no-underline"] },
        children: sources.map(source => ({
          type: "element", tagName: "span", properties: { className: ownSources.includes(source) ? ["text-blue-600"] : [] },
          children: [{ type: "text", value: `[${source}]` }],
        })),
      };
      let tail = tree.children.at(-1);
      while (tail?.type === "element" && ["ul", "ol", "blockquote", "li"].includes(tail.tagName)) {
        const child = tail.children.filter(node => node.type === "element").at(-1);
        if (!child) break;
        if (tail.tagName === "li" && !["p", "ul", "ol", "blockquote"].includes(child.tagName)) break;
        tail = child;
      }
      if (tail?.type === "element" && ["p", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(tail.tagName)) {
        tail.children.push(citation);
      } else {
        tree.children.push({ type: "element", tagName: "p", properties: {}, children: [citation] });
      }
    };
  }
  return (
    <div className="min-w-0 break-words text-sm leading-relaxed text-neutral-800 [&_p]:my-2 [&_h1]:my-3 [&_h1]:text-lg [&_h1]:font-bold [&_h2]:my-3 [&_h2]:text-base [&_h2]:font-bold [&_h3]:my-2 [&_h3]:font-semibold [&_h4]:my-2 [&_h4]:font-semibold [&_h5]:my-2 [&_h5]:font-semibold [&_h6]:my-2 [&_h6]:font-semibold [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-neutral-300 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-600 [&_pre]:overflow-x-auto [&_pre]:rounded [&_pre]:bg-neutral-100 [&_pre]:p-3 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:text-xs [&_hr]:my-3 [&_hr]:border-neutral-200 [&_th]:border [&_th]:border-neutral-200 [&_th]:bg-neutral-50 [&_th]:px-3 [&_th]:py-2 [&_td]:border [&_td]:border-neutral-200 [&_td]:px-3 [&_td]:py-2 [&>:first-child]:mt-0 [&>:last-child]:mb-0">
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[citationPlugin]}
        skipHtml
        components={{
          a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline underline-offset-2 hover:text-blue-800">{children}</a>,
          table: ({ children }) => <div className="my-3 overflow-x-auto"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
        }}
      >
        {text}
      </Markdown>
    </div>
  );
}
