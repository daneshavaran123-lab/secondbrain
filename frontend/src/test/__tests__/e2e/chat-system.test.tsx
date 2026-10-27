import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { MessageInput } from '@/components/chat/MessageInput';
import { MessageList } from '@/components/chat/MessageList';

// A chainable query builder like the backend shim's: every filter returns the
// builder, and awaiting it resolves to { data, error }.
function query(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const builder: any = {};
  for (const method of ['select', 'eq', 'is', 'order', 'update', 'maybeSingle']) {
    builder[method] = vi.fn(() => builder);
  }
  builder.insert = vi.fn(() => Promise.resolve({ data: null, error: null }));
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function realtimeChannel() {
  const channel: any = {
    on: vi.fn(() => channel),
    subscribe: vi.fn((cb?: (status: string) => void) => {
      cb?.('SUBSCRIBED');
      return channel;
    }),
    track: vi.fn(() => Promise.resolve()),
    presenceState: vi.fn(() => ({})),
  };
  return channel;
}

const mockSupabase = vi.hoisted(() => ({
  auth: { getUser: vi.fn() },
  from: vi.fn(),
  channel: vi.fn(),
  removeChannel: vi.fn(() => Promise.resolve()),
  storage: {
    from: vi.fn(() => ({
      upload: vi.fn(() => Promise.resolve({ error: null })),
      createSignedUrl: vi.fn(() => Promise.resolve({ data: { signedUrl: 'blob:test' }, error: null })),
    })),
  },
}));

vi.mock('@/integrations/supabase/client', () => ({ supabase: mockSupabase }));

const PLACEHOLDER = /پیام خود را بنویسید/;

describe('Chat', () => {
  const user = userEvent.setup();

  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabase.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1', email: 'sara@example.com' } } });
    mockSupabase.from.mockImplementation(() => query());
    mockSupabase.channel.mockImplementation(() => realtimeChannel());
  });

  describe('MessageInput', () => {
    it('renders the message box and the send button', () => {
      render(<MessageInput channelId="c1" />);
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'ارسال' })).toBeInTheDocument();
    });

    it('inserts the message into the channel and clears the box', async () => {
      const messages = query();
      mockSupabase.from.mockImplementation((table: string) => (table === 'messages' ? messages : query()));
      const onSent = vi.fn();
      render(<MessageInput channelId="c1" onSent={onSent} />);

      await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'جلسه ساعت ۱۰ است');
      await user.click(screen.getByRole('button', { name: 'ارسال' }));

      await waitFor(() => expect(onSent).toHaveBeenCalled());
      expect(messages.insert).toHaveBeenCalledWith(
        expect.objectContaining({ channel_id: 'c1', sender_id: 'u1', body: 'جلسه ساعت ۱۰ است' })
      );
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('');
    });

    it('does not send an empty message', async () => {
      const onSent = vi.fn();
      render(<MessageInput channelId="c1" onSent={onSent} />);
      await user.click(screen.getByRole('button', { name: 'ارسال' }));
      expect(mockSupabase.from).not.toHaveBeenCalled();
      expect(onSent).not.toHaveBeenCalled();
    });

    it('accepts file attachments', async () => {
      render(<MessageInput channelId="c1" />);
      const fileInput = screen.getByLabelText('پیوست فایل') as HTMLInputElement;
      const file = new File(['متن'], 'brief.txt', { type: 'text/plain' });
      await user.upload(fileInput, file);
      expect(fileInput.files?.[0]).toBe(file);
    });

    it('recovers when the session cannot be read', async () => {
      mockSupabase.auth.getUser.mockRejectedValueOnce(new Error('auth failed'));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<MessageInput channelId="c1" />);

      await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'سلام');
      await user.click(screen.getByRole('button', { name: 'ارسال' }));

      expect(mockSupabase.from).not.toHaveBeenCalled();
      // The button is usable again for a retry
      await waitFor(() => expect(screen.getByRole('button', { name: 'ارسال' })).toBeEnabled());
    });

    it('keeps the text when the server rejects the message', async () => {
      const messages = query();
      messages.insert.mockResolvedValueOnce({ data: null, error: { message: 'Network error' } });
      mockSupabase.from.mockImplementation((table: string) => (table === 'messages' ? messages : query()));
      const onSent = vi.fn();
      render(<MessageInput channelId="c1" onSent={onSent} />);

      await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'سلام');
      await user.click(screen.getByRole('button', { name: 'ارسال' }));

      await waitFor(() => expect(messages.insert).toHaveBeenCalled());
      expect(onSent).not.toHaveBeenCalled();
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toHaveValue('سلام');
    });
  });

  describe('MessageList', () => {
    it('shows the channel history', async () => {
      mockSupabase.from.mockImplementation(() =>
        query({
          data: [{ id: 'm1', channel_id: 'c1', sender_id: 'u2', body: 'گزارش آماده شد', rich: {}, attachments: [], created_at: '2026-10-27T08:00:00Z' }],
          error: null,
        })
      );
      render(<MessageList channelId="c1" />);
      expect(await screen.findByText('گزارش آماده شد')).toBeInTheDocument();
    });

    it('subscribes to live messages and unsubscribes on unmount', () => {
      const { unmount } = render(<MessageList channelId="c1" />);
      expect(mockSupabase.channel).toHaveBeenCalledWith('realtime:messages');
      const channel = mockSupabase.channel.mock.results[0].value;
      expect(channel.on).toHaveBeenCalledWith(
        'postgres_changes',
        expect.objectContaining({ table: 'messages', filter: 'channel_id=eq.c1' }),
        expect.any(Function)
      );
      unmount();
      expect(mockSupabase.removeChannel).toHaveBeenCalledWith(channel);
    });
  });

  describe('ChatPanel', () => {
    it('renders the task conversation', () => {
      render(<ChatPanel open onOpenChange={vi.fn()} channelId="c1" taskTitle="تهیه گزارش" />);
      expect(screen.getByText('گفتگو - تهیه گزارش')).toBeInTheDocument();
      expect(screen.getByPlaceholderText(PLACEHOLDER)).toBeInTheDocument();
    });

    it('announces typing through presence', async () => {
      render(<ChatPanel open onOpenChange={vi.fn()} channelId="c1" taskTitle="تهیه گزارش" />);
      await waitFor(() => expect(mockSupabase.channel).toHaveBeenCalledWith('room:chat:c1', expect.anything()));
      const roomCall = mockSupabase.channel.mock.calls.findIndex(([name]) => name === 'room:chat:c1');
      const room = mockSupabase.channel.mock.results[roomCall].value;

      await user.type(screen.getByPlaceholderText(PLACEHOLDER), 'د');
      await waitFor(() => expect(room.track).toHaveBeenCalledWith({ typing: true }));
    });

    it('renders nothing while closed', () => {
      render(<ChatPanel open={false} onOpenChange={vi.fn()} channelId="c1" taskTitle="تهیه گزارش" />);
      expect(screen.queryByText('گفتگو - تهیه گزارش')).not.toBeInTheDocument();
    });
  });
});
