import { Brush, type LucideIcon } from 'lucide-react-native';
import { useMemo } from 'react';

import { SERVICE_CATEGORIES, type ServiceCategory } from '../data/catalog';
import { useAppContent } from '../stores/appContent';

// Returns service list — API as source of truth (admin-editable),
// merged with local visual props (icon/colors/imageUrl) by code.
// Falls back to local SERVICE_CATEGORIES kalau API kosong (offline first launch).
export function useServices(): ServiceCategory[] {
  const apiServices = useAppContent((s) => s.content.services);
  const apiPackages = useAppContent((s) => s.content.packages);

  return useMemo(() => {
    if (apiServices.length === 0) return SERVICE_CATEGORIES;
    const localByCode = new Map(SERVICE_CATEGORIES.map((s) => [s.code, s]));
    return apiServices.map((api) => {
      const local = localByCode.get(api.code);
      // Compute startingPrice from cheapest package for this service
      const pkgs = apiPackages.filter((p) => p.serviceId === api.id);
      const minPrice = pkgs.length > 0 ? Math.min(...pkgs.map((p) => Number(p.price))) : (local?.startingPrice ?? 0);

      const merged: ServiceCategory = {
        code: api.code,
        name: api.name,
        description: api.description ?? local?.description ?? '',
        icon: (local?.icon ?? Brush) as LucideIcon,
        iconColor: local?.iconColor ?? '#475569',
        iconBg: local?.iconBg ?? '#E2E8F0',
        // CMS-set icon URL kalau admin upload, override Lucide di tile grid
        customIconUrl: (api.iconUrl as string | undefined) ?? null,
        imageUrl: local?.imageUrl ?? SERVICE_CATEGORIES[0]!.imageUrl,
        startingPrice: minPrice,
        popular: local?.popular,
        // Default true kalau API gak return field (backwards compat)
        showOnHome: api.showOnHome !== false,
      };
      return merged;
    });
  }, [apiServices, apiPackages]);
}
