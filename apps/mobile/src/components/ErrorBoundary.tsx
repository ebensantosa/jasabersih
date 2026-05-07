import { AlertCircle } from 'lucide-react-native';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, info);
  }

  reset = (): void => this.setState({ error: null });

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <View className="flex-1 items-center justify-center bg-white px-6">
          <View className="h-20 w-20 items-center justify-center rounded-full bg-red-50">
            <AlertCircle color="#DC2626" size={36} strokeWidth={2} />
          </View>
          <Text className="font-bold mt-4 text-lg text-ink-900">Ada yang salah</Text>
          <Text className="font-sans mt-1 text-center text-sm text-ink-500">
            Aplikasi crash. Coba reset state atau restart aplikasi.
          </Text>
          <Text
            className="font-sans mt-3 max-h-24 px-2 text-center text-[11px] text-ink-400"
            numberOfLines={4}
          >
            {String(this.state.error.message ?? this.state.error)}
          </Text>
          <Pressable
            onPress={this.reset}
            className="mt-6 rounded-2xl bg-brand-600 px-6 py-3"
          >
            <Text className="font-bold text-sm text-white">Coba Lagi</Text>
          </Pressable>
        </View>
      );
    }
    return this.props.children;
  }
}
