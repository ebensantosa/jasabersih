import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function Root(): React.ReactElement | null {
  redirect('/admin');
}
