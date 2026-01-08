import { definePlugin, ExpressiveCodeAnnotation, type AnnotationRenderOptions } from '@expressive-code/core'
import { h } from '@expressive-code/core/hast';

function getRegex() {
  // ends up looking something like this: 
  //
  //   \ [link ] (href )
  // /\\\[(.+)\]\((.+)\)/g

  const capture = (r: string) => '(' + r + ')';
  const escape = (c: string) => '\\' + c;
  const allExcept = (c: string) => '[^' + c + ']';
  const oneOrMore = (r: string) => r + '+';

  const surrounded = (start: string, wrapper: (x: string) => string, end: string) =>
    start + wrapper(oneOrMore(allExcept(end))) + end;

  const link = surrounded(escape('['), capture, escape(']'))
  const href = surrounded(escape('('), capture, escape(')'))

  // currently doesn't allow escaping the escape
  const regex = escape('\\') + link + href;

  return new RegExp(regex, 'g');
}

export function pluginLink() {
  return definePlugin({
    name: 'Links inside code blocks, e.g. \\[link][href]',
    hooks: {
      preprocessCode: (context) => {
        for (const line of context.codeBlock.getLines()) {
          const matches = [...line.text.matchAll(getRegex())];

          // account for multiple links in one line
          let offset = 0;

          for (const match of matches) {
            const [original, link, href] = match;

            const from = (match.index || 0) - offset;
            const to = from + original.length;

            line.addAnnotation(
              new LinkAnnotation({
                href,
                inlineRange: {
                  columnStart: from,
                  columnEnd: to,
                }
              })
            )
            // this already culls annotation
            line.editText(from, to, link);

            offset += original.length - link.length;
          }
        }
      }
    },
  })
}

class LinkAnnotation extends ExpressiveCodeAnnotation {
  href: string;
  constructor(options: ConstructorParameters<typeof ExpressiveCodeAnnotation>[0] & { href: string }) {
    const { href, ...original } = options;
    super(original);

    this.href = href;
  }
  render({ nodesToTransform }: AnnotationRenderOptions) {
    return nodesToTransform.map((node) => {
      if (node.type !== 'element') {
        // e.g.
        //   con[st x](href) = 1
        //   
        // `const` and `x` are put in different `spans`s by EC
        // in order for syntax highlight to work. 

        type Node = object & { value?: string, children?: Node[] };

        const getText = (el: Node): string =>
          el.value ?? el.children?.map(getText).join('') ?? '';

        throw new Error(
          '[expressive-code-links]: Used link annotation spanning multiple expressive-code elements:\n'
          + '  ' + getText(node)
        );
      }

      return h(
        node.tagName, 
        node.properties,
        h(
          'a.ec-link',
          {
            href: this.href,
            style: 'color: inherit',
          },
          ...node.children
        )
      )
    })
  }
}

