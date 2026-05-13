import { Star, X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { api } from '../lib/api';
import { toast } from '../stores/ui';

const TIP_OPTIONS = [0, 5_000, 10_000, 20_000, 50_000];

export function RatingFormModal({
  bookingId,
  cleanerName,
  open,
  onClose,
  onSubmitted,
}: {
  bookingId: string;
  cleanerName: string;
  open: boolean;
  onClose: () => void;
  onSubmitted: () => void;
}) {
  const [rating, setRating] = useState(5);
  const [review, setReview] = useState('');
  const [tipAmount, setTipAmount] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    setSubmitting(true);
    try {
      await api.post('/ratings', { bookingId, rating, review: review.trim() || undefined, tipAmount });
      toast.success(`Rating ${rating}⭐ terkirim. Terima kasih!`);
      onSubmitted();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message ?? 'Gagal kirim rating');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/50">
        <View className="rounded-t-3xl bg-white" style={{ maxHeight: '90%' }}>
          <View className="flex-row items-center justify-between border-b border-ink-100 px-4 py-3">
            <Text className="font-bold text-base text-ink-900">Beri Rating</Text>
            <Pressable onPress={onClose} className="h-8 w-8 items-center justify-center rounded-full bg-ink-100">
              <X color="#0F172A" size={16} />
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
            <View className="items-center">
              <Text className="font-sans text-sm text-ink-600">Bagaimana pengalaman dengan</Text>
              <Text className="font-bold mt-0.5 text-base text-ink-900">{cleanerName}?</Text>
              <View className="mt-4 flex-row gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable key={n} onPress={() => setRating(n)} className="p-2">
                    <Star
                      size={36}
                      color={n <= rating ? '#FACC15' : '#E2E8F0'}
                      fill={n <= rating ? '#FACC15' : 'transparent'}
                      strokeWidth={1.5}
                    />
                  </Pressable>
                ))}
              </View>
              <Text className="font-medium mt-1 text-xs text-ink-500">
                {rating === 5 ? 'Excellent!' : rating === 4 ? 'Good' : rating === 3 ? 'OK' : rating === 2 ? 'Buruk' : 'Sangat buruk'}
              </Text>
            </View>

            <View>
              <Text className="font-semibold mb-2 text-xs text-ink-700">Review (opsional)</Text>
              <TextInput
                value={review}
                onChangeText={setReview}
                placeholder="Bagi pengalamanmu untuk customer lain…"
                placeholderTextColor="#94A3B8"
                multiline
                style={{ minHeight: 80, textAlignVertical: 'top' }}
                className="font-sans rounded-xl border border-ink-200 bg-ink-50 p-3 text-sm text-ink-900"
              />
            </View>

          </ScrollView>

          <View className="flex-row gap-2 border-t border-ink-100 p-4">
            <Pressable onPress={onClose} className="flex-1 items-center justify-center rounded-xl bg-ink-100 py-3">
              <Text className="font-semibold text-sm text-ink-700">Batal</Text>
            </Pressable>
            <Pressable
              onPress={submit}
              disabled={submitting}
              className={`flex-1 items-center justify-center rounded-xl py-3 ${submitting ? 'bg-brand-400' : 'bg-brand-600'}`}
            >
              {submitting ? <ActivityIndicator color="white" /> : <Text className="font-semibold text-sm text-white">Kirim Rating</Text>}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
