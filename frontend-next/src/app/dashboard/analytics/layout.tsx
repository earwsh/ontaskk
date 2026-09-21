import AnalyticsLayout from '@/components/analytics/AnalyticsLayout';

export default function Layout({ children }: { children: React.ReactNode }) {
  return <AnalyticsLayout>{children}</AnalyticsLayout>;
}
