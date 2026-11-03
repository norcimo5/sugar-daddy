import { shareOrCopy } from './share';

describe('shareOrCopy', () => {
  it('uses the system share sheet when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrCopy('hello', { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ title: 'Sugar Daddy', text: 'hello' });
  });

  it('treats a user cancel as cancelled, not an error, and does not copy', async () => {
    const share = vi.fn().mockRejectedValue(Object.assign(new Error('x'), { name: 'AbortError' }));
    const writeText = vi.fn();
    expect(await shareOrCopy('t', { share, clipboard: { writeText } })).toBe('cancelled');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('falls back to copying when sharing is unavailable or fails', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    expect(await shareOrCopy('t', { clipboard: { writeText } })).toBe('copied');
    const share = vi.fn().mockRejectedValue(new Error('NotAllowed'));
    expect(await shareOrCopy('t', { share, clipboard: { writeText } })).toBe('copied');
  });

  it('reports unavailable when neither works', async () => {
    expect(await shareOrCopy('t', {})).toBe('unavailable');
    const writeText = vi.fn().mockRejectedValue(new Error('denied'));
    expect(await shareOrCopy('t', { clipboard: { writeText } })).toBe('unavailable');
  });
});
