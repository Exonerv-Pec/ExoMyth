/**
 * A world can come from someone else (a shared folder, a downloaded example). Opening it must
 * never run code, contact other servers, or let the page imitate the app.
 */
import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { renderMarkdown } from '../src/core/render';

const render = (md: string) => {
  const div = document.createElement('div');
  div.innerHTML = renderMarkdown(md, new VaultIndex([parsePage('Real.md', '', 1)]));
  return div;
};

describe('opening an untrusted world', () => {
  it('runs no scripts, event handlers or javascript: links', () => {
    const div = render(
      '<script>alert(1)</script><img src=x onerror="alert(2)"><a href="javascript:alert(3)">x</a>' +
        '<svg><script>alert(4)</script></svg><iframe src="https://evil.example"></iframe>',
    );
    const html = div.innerHTML;
    expect(html).not.toMatch(/<script|onerror|javascript:|<iframe/i);
  });

  it('cannot imitate the app: no inline styles, app classes, forms or text fields', () => {
    const div = render(
      '<div class="scrim dialog" style="position:fixed;inset:0">Session expired. ' +
        '<form action="https://evil.example"><input type="password" name="p"><button>Sign in</button></form></div>',
    );
    expect(div.querySelector('[style]')).toBeNull();
    expect(div.querySelector('.scrim, .dialog')).toBeNull();
    expect(div.querySelector('form, input, button')).toBeNull();
  });

  it('keeps what pages legitimately use', () => {
    const div = render('[[Real]] ||secret|| ![[map.png]]\n\n- [x] done\n- [ ] todo\n\n```js\nlet a = 1;\n```');
    expect(div.querySelector('a.wikilink')).toBeTruthy();
    expect(div.querySelector('.spoiler')).toBeTruthy();
    expect(div.querySelector('.embed.embed-image')).toBeTruthy();
    const boxes = div.querySelectorAll<HTMLInputElement>('input[type="checkbox"]');
    expect(boxes.length).toBe(2);
    expect([...boxes].every((b) => b.disabled)).toBe(true);
    expect(div.querySelector('code.language-js')).toBeTruthy();
  });

  it('turns web images into links instead of loading them', () => {
    const div = render('![tracker](https://evil.example/pixel.png)');
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('a.external-media')).toBeTruthy();
  });
});
