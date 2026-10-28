import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  MapPin,
  Plus,
  Trash2,
  FolderPlus,
  Navigation,
  Smartphone,
  Search,
  Loader2,
  Folder,
  Layers,
  ChevronDown,
  ChevronUp,
  Globe,
  Compass,
  Edit2,
  X,
  Pin,
  Star,
} from 'lucide-react';
import type { CustomLocation, LocationGroup, Instance, LocationData, CustomLocationsCatalog } from '../../types';
import { api } from '../../lib/api';
import { MapPicker } from '../MapPicker';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { toast } from 'sonner';
import { cn } from '../../lib/utils';

interface CustomLocationsManagerProps {
  instances: Instance[];
  onRefreshInstances?: () => void;
  locationPresets?: Record<string, LocationData>;
}

export const GLOBAL_PRESETS_MAP: Record<
  string,
  { key: string; name: string; city: string; latitude: number; longitude: number; timezone: string; altitude?: number }
> = {
  ba: { key: 'ba', name: 'Buenos Aires', city: 'Buenos Aires, Argentina (Obelisco)', latitude: -34.603722, longitude: -58.381592, timezone: 'America/Argentina/Buenos_Aires', altitude: 25 },
  'buenos-aires': { key: 'ba', name: 'Buenos Aires', city: 'Buenos Aires, Argentina (Obelisco)', latitude: -34.603722, longitude: -58.381592, timezone: 'America/Argentina/Buenos_Aires', altitude: 25 },
  'sao-paulo': { key: 'sao-paulo', name: 'São Paulo', city: 'São Paulo, Brasil', latitude: -23.55052, longitude: -46.633308, timezone: 'America/Sao_Paulo', altitude: 760 },
  miami: { key: 'miami', name: 'Miami', city: 'Miami, Florida, EE.UU.', latitude: 25.76168, longitude: -80.19179, timezone: 'America/New_York', altitude: 2 },
  'new-york': { key: 'new-york', name: 'New York', city: 'New York, EE.UU.', latitude: 40.712776, longitude: -74.005974, timezone: 'America/New_York', altitude: 10 },
  ny: { key: 'new-york', name: 'New York', city: 'New York, EE.UU.', latitude: 40.712776, longitude: -74.005974, timezone: 'America/New_York', altitude: 10 },
  cordoba: { key: 'cordoba', name: 'Córdoba', city: 'Córdoba, Argentina', latitude: -31.420083, longitude: -64.188776, timezone: 'America/Argentina/Cordoba', altitude: 390 },
  rosario: { key: 'rosario', name: 'Rosario', city: 'Rosario, Argentina', latitude: -32.9587, longitude: -60.693, timezone: 'America/Argentina/Cordoba', altitude: 31 },
  mendoza: { key: 'mendoza', name: 'Mendoza', city: 'Mendoza, Argentina', latitude: -32.89084, longitude: -68.82717, timezone: 'America/Argentina/Mendoza', altitude: 746 },
  bariloche: { key: 'bariloche', name: 'Bariloche', city: 'San Carlos de Bariloche, Argentina', latitude: -41.134258, longitude: -71.308525, timezone: 'America/Argentina/Salta', altitude: 840 },
  santiago: { key: 'santiago', name: 'Santiago', city: 'Santiago de Chile, Chile', latitude: -33.44889, longitude: -70.669265, timezone: 'America/Santiago', altitude: 570 },
  bogota: { key: 'bogota', name: 'Bogotá', city: 'Bogotá, Colombia', latitude: 4.710989, longitude: -74.072092, timezone: 'America/Bogota', altitude: 2640 },
  lima: { key: 'lima', name: 'Lima', city: 'Lima, Perú', latitude: -12.046374, longitude: -77.042793, timezone: 'America/Lima', altitude: 154 },
  cdmx: { key: 'cdmx', name: 'CDMX', city: 'Ciudad de México, México', latitude: 19.432608, longitude: -99.133209, timezone: 'America/Mexico_City', altitude: 2240 },
  mexico: { key: 'cdmx', name: 'CDMX', city: 'Ciudad de México, México', latitude: 19.432608, longitude: -99.133209, timezone: 'America/Mexico_City', altitude: 2240 },
  'los-angeles': { key: 'los-angeles', name: 'Los Angeles', city: 'Los Angeles, California, EE.UU.', latitude: 34.052235, longitude: -118.243683, timezone: 'America/Los_Angeles', altitude: 71 },
  madrid: { key: 'madrid', name: 'Madrid', city: 'Madrid, España', latitude: 40.416775, longitude: -3.70379, timezone: 'Europe/Madrid', altitude: 667 },
  barcelona: { key: 'barcelona', name: 'Barcelona', city: 'Barcelona, España', latitude: 41.387917, longitude: 2.169919, timezone: 'Europe/Madrid', altitude: 12 },
  london: { key: 'london', name: 'Londres', city: 'Londres, Reino Unido', latitude: 51.507351, longitude: -0.127758, timezone: 'Europe/London', altitude: 11 },
  tokyo: { key: 'tokyo', name: 'Tokio', city: 'Tokio, Japón', latitude: 35.676192, longitude: 139.650311, timezone: 'Asia/Tokyo', altitude: 40 },
};

export function getPresetDisplay(key: string, customPresets?: Record<string, LocationData>) {
  const cleanKey = key.toLowerCase();
  if (GLOBAL_PRESETS_MAP[cleanKey]) {
    return GLOBAL_PRESETS_MAP[cleanKey];
  }
  if (customPresets && customPresets[cleanKey]) {
    const p = customPresets[cleanKey];
    return {
      key: cleanKey,
      name: p.city.split(',')[0],
      city: p.city,
      latitude: p.latitude,
      longitude: p.longitude,
      timezone: p.timezone || 'UTC',
      altitude: p.altitude,
    };
  }
  return {
    key: cleanKey,
    name: key,
    city: key,
    latitude: 0,
    longitude: 0,
    timezone: 'UTC',
    altitude: 0,
  };
}

const PALETTE_COLORS = [
  '#10b981', // emerald
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#06b6d4', // cyan
  '#6366f1', // indigo
];

export const CustomLocationsManager: React.FC<CustomLocationsManagerProps> = ({
  instances,
  onRefreshInstances,
  locationPresets = {},
}) => {
  const [catalog, setCatalog] = useState<CustomLocationsCatalog>({
    groups: [],
    locations: [],
    pinned_presets: ['ba', 'sao-paulo', 'miami', 'new-york'],
  });
  const [loading, setLoading] = useState(true);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Estados del creador interactivo en el mapa
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [locName, setLocName] = useState('');
  const [locGroupId, setLocGroupId] = useState<string>('');
  const [locTimezone, setLocTimezone] = useState('America/Argentina/Buenos_Aires');
  const [locAltitude, setLocAltitude] = useState(25);
  const [locIsPinned, setLocIsPinned] = useState(false);
  const [locSetAsDefault, setLocSetAsDefault] = useState(false);
  const [savingLoc, setSavingLoc] = useState(false);
  const [showAdvancedCoords, setShowAdvancedCoords] = useState(false);

  // Estados para crear/editar grupo
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LocationGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('#10b981');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

  // Estado para desplegar presets globales oficiales
  const [showPresetsGlobal, setShowPresetsGlobal] = useState(false);
  const [presetSearchQuery, setPresetSearchQuery] = useState('');
  const isMapInitializedRef = useRef(false);

  // Cargar catálogo inicial
  const loadCatalog = useCallback(async () => {
    try {
      setLoading(true);
      const data = await api.getCustomLocations();
      setCatalog(data);
      if (data.groups.length > 0 && !locGroupId) {
        setLocGroupId(data.groups[0].id);
      }
      // Inicializar el mapa con la ubicación predeterminada general al cargar
      if (!isMapInitializedRef.current && data.default_location) {
        isMapInitializedRef.current = true;
        setMapLat(data.default_location.latitude);
        setMapLon(data.default_location.longitude);
        setMapCity(data.default_location.city);
        if (data.default_location.timezone) setLocTimezone(data.default_location.timezone);
        if (data.default_location.altitude) setLocAltitude(data.default_location.altitude);
      }
    } catch (err: any) {
      toast.error(`Error al cargar ubicaciones custom: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [locGroupId]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  // Listas de pines activos para la barra FocusView
  const pinnedLocations = useMemo(() => {
    return catalog.locations.filter((loc) => loc.is_pinned);
  }, [catalog.locations]);

  const pinnedPresetsList = useMemo(() => {
    const list = catalog.pinned_presets || ['ba', 'sao-paulo', 'miami', 'new-york'];
    return list.map((key) => getPresetDisplay(key, locationPresets));
  }, [catalog.pinned_presets, locationPresets]);

  // Catálogo completo de presets combinados
  const allPresetsMap = useMemo(() => {
    const map: Record<
      string,
      { key: string; name: string; city: string; latitude: number; longitude: number; timezone: string; altitude?: number }
    > = {
      ...GLOBAL_PRESETS_MAP,
    };
    if (locationPresets) {
      Object.entries(locationPresets).forEach(([k, v]) => {
        const cleanK = k.toLowerCase();
        if (!map[cleanK]) {
          map[cleanK] = {
            key: cleanK,
            name: v.city.split(',')[0],
            city: v.city,
            latitude: v.latitude,
            longitude: v.longitude,
            timezone: v.timezone || 'UTC',
            altitude: v.altitude,
          };
        }
      });
    }
    return map;
  }, [locationPresets]);

  const filteredPresets = useMemo(() => {
    const q = presetSearchQuery.trim().toLowerCase();
    const entries = Object.entries(allPresetsMap);
    if (!q) return entries;
    return entries.filter(
      ([key, loc]) =>
        key.toLowerCase().includes(q) ||
        loc.name.toLowerCase().includes(q) ||
        loc.city.toLowerCase().includes(q)
    );
  }, [allPresetsMap, presetSearchQuery]);

  // Filtrado de ubicaciones custom
  const filteredLocations = useMemo(() => {
    return catalog.locations.filter((loc) => {
      const matchGroup = selectedGroupId ? loc.group_id === selectedGroupId : true;
      const matchQuery = searchQuery.trim()
        ? loc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          loc.city.toLowerCase().includes(searchQuery.toLowerCase())
        : true;
      return matchGroup && matchQuery;
    });
  }, [catalog.locations, selectedGroupId, searchQuery]);

  // Mapa de grupos por id
  const groupsMap = useMemo(() => {
    const map = new Map<string, LocationGroup>();
    catalog.groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [catalog.groups]);

  // Toggle pin de custom location o de preset oficial
  const handleTogglePin = async (type: 'custom' | 'preset', id: string, pinned?: boolean) => {
    try {
      const res = await api.togglePin(type, id, pinned);
      if (type === 'custom') {
        const updated = res.location as CustomLocation;
        setCatalog((prev) => ({
          ...prev,
          locations: prev.locations.map((loc) => (loc.id === id ? { ...loc, is_pinned: updated.is_pinned } : loc)),
        }));
        toast.success(
          updated.is_pinned
            ? `"${updated.name}" fijada en accesos rápidos de FocusView`
            : `"${updated.name}" desfijada de accesos rápidos`
        );
      } else {
        const pinnedList = (res.pinned_presets || []) as string[];
        setCatalog((prev) => ({
          ...prev,
          pinned_presets: pinnedList,
        }));
        const isNowPinned = pinnedList.includes(id.toLowerCase());
        const info = getPresetDisplay(id, locationPresets);
        toast.success(
          isNowPinned
            ? `Preset "${info.name}" fijado en FocusView`
            : `Preset "${info.name}" desfijado de FocusView`
        );
      }
    } catch (err: any) {
      toast.error(`Error al alternar pin: ${err.message}`);
    }
  };

  // Configurar ubicación como predeterminada del sistema y aplicar al mapa interactivo
  const handleSetDefaultLocation = async (type: 'custom' | 'preset', id: string, name: string) => {
    try {
      const res = await api.setDefaultLocation({
        target_type: type,
        target_id: id,
      });
      setCatalog((prev) => ({
        ...prev,
        default_location: res,
      }));

      // Centrar y actualizar inmediatamente el mapa interactivo de la derecha
      setMapLat(res.latitude);
      setMapLon(res.longitude);
      setMapCity(res.city);
      if (res.timezone) setLocTimezone(res.timezone);
      if (res.altitude) setLocAltitude(res.altitude);

      toast.success(`"${name}" configurada como ubicación predeterminada general y centrada en el mapa`);
    } catch (err: any) {
      toast.error(`Error al establecer predeterminada: ${err.message}`);
    }
  };

  // Guardar nueva ubicación personalizada
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      toast.error('Ingresa un nombre para la ubicación personalizada');
      return;
    }
    setSavingLoc(true);
    try {
      const created = await api.createCustomLocation({
        name: locName.trim(),
        group_id: locGroupId || undefined,
        city: mapCity.trim() || undefined,
        latitude: mapLat,
        longitude: mapLon,
        altitude: Number(locAltitude) || 25,
        timezone: locTimezone,
        is_pinned: locIsPinned,
      });

      if (locSetAsDefault) {
        await api.setDefaultLocation({
          target_type: 'custom',
          target_id: created.id,
        });
      }

      toast.success(
        locSetAsDefault
          ? `Ubicación "${created.name}" guardada y configurada como predeterminada del sistema`
          : locIsPinned
          ? `Ubicación "${created.name}" guardada y fijada en barra rápida`
          : `Ubicación "${created.name}" guardada con éxito`
      );
      setLocName('');
      setLocIsPinned(false);
      setLocSetAsDefault(false);
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Error al guardar: ${err.message}`);
    } finally {
      setSavingLoc(false);
    }
  };

  // Eliminar ubicación
  const handleDeleteLocation = async (id: string, name: string) => {
    try {
      await api.deleteCustomLocation(id);
      toast.success(`Ubicación "${name}" eliminada`);
      setCatalog((prev) => ({
        ...prev,
        locations: prev.locations.filter((l) => l.id !== id),
      }));
    } catch (err: any) {
      toast.error(`Error al eliminar ubicación: ${err.message}`);
    }
  };

  // Asignar ubicación custom a un contenedor
  const handleAssignToInstance = async (instanceName: string, loc: CustomLocation) => {
    try {
      await api.setInstanceLocation(instanceName, {
        custom_location_id: loc.id,
        custom_name: loc.name,
        city: loc.city,
        latitude: loc.latitude,
        longitude: loc.longitude,
        altitude: loc.altitude,
        timezone: loc.timezone,
      });
      toast.success(`Ubicación "${loc.name}" asignada a "${instanceName}"`);
      onRefreshInstances?.();
    } catch (err: any) {
      toast.error(`Error al asignar ubicación: ${err.message}`);
    }
  };

  // Guardar grupo (crear o editar)
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim()) {
      toast.error('Ingresa un nombre para el grupo');
      return;
    }
    setSavingGroup(true);
    try {
      if (editingGroup) {
        await api.updateLocationGroup(editingGroup.id, {
          name: groupNameInput.trim(),
          color: groupColorInput,
          description: groupDescInput.trim(),
        });
        toast.success(`Grupo "${groupNameInput}" actualizado`);
      } else {
        const created = await api.createLocationGroup({
          name: groupNameInput.trim(),
          color: groupColorInput,
          description: groupDescInput.trim(),
        });
        toast.success(`Grupo "${created.name}" creado`);
        if (!locGroupId) setLocGroupId(created.id);
      }
      setGroupModalOpen(false);
      setEditingGroup(null);
      setGroupNameInput('');
      setGroupDescInput('');
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Error al guardar grupo: ${err.message}`);
    } finally {
      setSavingGroup(false);
    }
  };

  // Eliminar grupo
  const handleDeleteGroup = async (groupId: string, groupName: string) => {
    if (!confirm(`¿Eliminar el grupo "${groupName}"? Las ubicaciones dentro de este grupo quedarán sin asignar.`)) {
      return;
    }
    try {
      await api.deleteLocationGroup(groupId);
      toast.success(`Grupo "${groupName}" eliminado`);
      if (selectedGroupId === groupId) setSelectedGroupId(null);
      if (locGroupId === groupId) setLocGroupId('');
      await loadCatalog();
    } catch (err: any) {
      toast.error(`Error al eliminar grupo: ${err.message}`);
    }
  };

  const openNewGroupModal = () => {
    setEditingGroup(null);
    setGroupNameInput('');
    setGroupColorInput('#10b981');
    setGroupDescInput('');
    setGroupModalOpen(true);
  };

  const openEditGroupModal = (g: LocationGroup) => {
    setEditingGroup(g);
    setGroupNameInput(g.name);
    setGroupColorInput(g.color || '#10b981');
    setGroupDescInput(g.description || '');
    setGroupModalOpen(true);
  };

  // Centrar mapa en una ubicación existente
  const handleSelectOnMap = (loc: CustomLocation) => {
    setMapLat(loc.latitude);
    setMapLon(loc.longitude);
    setMapCity(loc.city);
    setLocTimezone(loc.timezone || 'America/Argentina/Buenos_Aires');
    setLocAltitude(loc.altitude || 25);
    toast.info(`Centrado en: ${loc.name}`);
  };

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6 space-y-5">
      {/* Cabecera Principal */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary/10 text-primary border border-primary/20">
              <Compass className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base md:text-lg font-bold text-foreground">
                Geolocalización & Ubicaciones Personalizadas
              </h2>
              <p className="text-xs text-muted-foreground">
                Crea, agrupa y asigna coordenadas GPS a tus instancias de forma intuitiva
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={openNewGroupModal}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-accent transition-colors shadow-xs"
          >
            <FolderPlus className="h-3.5 w-3.5 text-primary" />
            <span>Nuevo Grupo</span>
          </button>
        </div>
      </div>

      {/* Grid Principal: Lista Compacta a la Izquierda / Mapa & Creador a la Derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* COLUMNA IZQUIERDA: Grupos y Lista Compacta de Ubicaciones (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          {/* Banner: Ubicación Predeterminada General del Sistema */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3.5 shadow-xs space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-500 border border-amber-500/40">
                  <Star className="h-4 w-4 fill-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Ubicación Predeterminada del Sistema
                    </span>
                    <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-600 dark:text-amber-400 border border-amber-500/30">
                      Activa por Defecto
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Los nuevos contenedores creados y las vistas de mapa usarán esta ubicación como referencia inicial.
                  </p>
                </div>
              </div>

              {catalog.default_location && (
                <button
                  type="button"
                  onClick={() => {
                    setMapLat(catalog.default_location!.latitude);
                    setMapLon(catalog.default_location!.longitude);
                    setMapCity(catalog.default_location!.city);
                    if (catalog.default_location!.timezone) setLocTimezone(catalog.default_location!.timezone);
                    toast.info(`Centrado en predeterminada: ${catalog.default_location!.name}`);
                  }}
                  className="flex items-center gap-1 rounded-md border border-amber-500/40 bg-background/80 px-2.5 py-1 text-xs font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-500/10 transition-colors"
                >
                  <Navigation className="h-3 w-3 text-amber-500" />
                  <span>Ver en Mapa</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1 text-xs border-t border-amber-500/20 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-muted-foreground text-[11px]">Ubicación:</span>
                <span className="font-bold text-foreground">{catalog.default_location?.name || 'Buenos Aires'}</span>
                <span className="text-muted-foreground text-[11px]">({catalog.default_location?.city || 'Buenos Aires'})</span>
              </div>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                <span>•</span>
                <span>{catalog.default_location?.latitude.toFixed(6)}, {catalog.default_location?.longitude.toFixed(6)}</span>
                <span>•</span>
                <span>{catalog.default_location?.timezone || 'America/Argentina/Buenos_Aires'}</span>
              </div>
            </div>
          </div>

          {/* Panel: Accesos Rápidos Activos en FocusView */}
          <div className="rounded-xl border border-border bg-card/75 p-3.5 shadow-xs space-y-2.5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30">
                  <Pin className="h-4 w-4 fill-amber-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Accesos Rápidos en FocusView
                    </span>
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400">
                      {pinnedLocations.length + pinnedPresetsList.length} fijados
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Aparecen directamente en la barra GPS de FocusView. Puedes desfijar ciudades oficiales y fijar tus ubicaciones personalizadas.
                  </p>
                </div>
              </div>
            </div>

            {/* Chips de fijados */}
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {pinnedLocations.length === 0 && pinnedPresetsList.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-2.5 text-center text-xs text-muted-foreground w-full">
                  No hay accesos fijados actualmente. Fija presets oficiales o ubicaciones custom haciendo clic en el icono de pin.
                </div>
              ) : (
                <>
                  {/* Presets Globales Fijados */}
                  {pinnedPresetsList.map((p) => (
                    <div
                      key={`preset-${p.key}`}
                      className="flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground shadow-xs hover:border-border/80 transition-colors"
                    >
                      <Globe className="h-3 w-3 text-primary shrink-0" />
                      <span className="font-semibold">{p.name}</span>
                      <span className="text-[9px] font-mono text-muted-foreground uppercase opacity-75">(Preset)</span>
                      <button
                        type="button"
                        onClick={() => handleTogglePin('preset', p.key, false)}
                        title={`Desfijar ${p.name} de FocusView`}
                        className="rounded-full p-0.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}

                  {/* Ubicaciones Custom Fijadas */}
                  {pinnedLocations.map((loc) => {
                    const grp = loc.group_id ? groupsMap.get(loc.group_id) : null;
                    return (
                      <div
                        key={`custom-${loc.id}`}
                        className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-foreground shadow-xs transition-colors"
                      >
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: grp?.color || '#10b981' }}
                        />
                        <span className="font-bold text-primary">{loc.name}</span>
                        <span className="text-[9px] text-muted-foreground truncate max-w-[90px]">({loc.city})</span>
                        <button
                          type="button"
                          onClick={() => handleTogglePin('custom', loc.id, false)}
                          title={`Desfijar ${loc.name} de FocusView`}
                          className="rounded-full p-0.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors ml-0.5"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </div>

          {/* Barra de Filtros por Grupo */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs scrollbar-none">
            <button
              onClick={() => setSelectedGroupId(null)}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors shrink-0 border',
                selectedGroupId === null
                  ? 'bg-primary text-primary-foreground border-primary font-semibold shadow-xs'
                  : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'
              )}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>Todas ({catalog.locations.length})</span>
            </button>

            {catalog.groups.map((group) => {
              const count = catalog.locations.filter((l) => l.group_id === group.id).length;
              const isSelected = selectedGroupId === group.id;
              return (
                <div key={group.id} className="relative group shrink-0">
                  <button
                    onClick={() => setSelectedGroupId(group.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border',
                      isSelected
                        ? 'bg-card border-foreground/30 text-foreground font-semibold shadow-xs'
                        : 'bg-card text-muted-foreground border-border hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: group.color || '#10b981' }}
                    />
                    <span>{group.name}</span>
                    <span className="ml-1 text-[10px] font-mono opacity-60">({count})</span>
                  </button>

                  {/* Acciones de Grupo en Hover o activo */}
                  {isSelected && (
                    <div className="inline-flex items-center ml-1 gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditGroupModal(group);
                        }}
                        title="Editar grupo"
                        className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id, group.name);
                        }}
                        title="Eliminar grupo"
                        className="rounded p-1 text-rose-500 hover:text-rose-600 hover:bg-rose-500/10"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Buscador Rápido */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre personalizado o ciudad..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8.5 rounded-lg border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Lista Compacta de Ubicaciones */}
          <div className="space-y-2">
            {loading ? (
              <div className="flex items-center justify-center p-8 text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Cargando ubicaciones...
              </div>
            ) : filteredLocations.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card/50 p-8 text-center">
                <MapPin className="mx-auto h-8 w-8 text-muted-foreground/50 mb-2" />
                <p className="text-xs font-semibold text-foreground">No hay ubicaciones en esta vista</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  Usa el mapa interactivo de la derecha para fijar coordenadas y guardarlas.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border/60 rounded-xl border border-border bg-card shadow-xs overflow-hidden">
                {filteredLocations.map((loc) => {
                  const grp = loc.group_id ? groupsMap.get(loc.group_id) : null;
                  const isDefaultLoc = catalog.default_location?.id === loc.id;
                  return (
                    <div
                      key={loc.id}
                      className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-accent/40"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {/* Dot del grupo */}
                        <div
                          className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: grp?.color || '#94a3b8' }}
                          title={grp?.name || 'Sin grupo'}
                        />

                        <div className="min-w-0 space-y-0.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-xs text-foreground truncate">
                              {loc.name}
                            </span>
                            {isDefaultLoc && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/30 px-1.5 py-0.2 text-[9px] font-bold text-amber-600 dark:text-amber-400">
                                <Star className="h-2.5 w-2.5 fill-amber-500" />
                                <span>Predeterminada General</span>
                              </span>
                            )}
                            {grp && (
                              <span
                                className="inline-flex items-center rounded-full px-1.5 py-0.2 text-[9px] font-medium"
                                style={{
                                  backgroundColor: `${grp.color || '#10b981'}15`,
                                  color: grp.color || '#10b981',
                                  border: `1px solid ${grp.color || '#10b981'}30`,
                                }}
                              >
                                {grp.name}
                              </span>
                            )}
                          </div>

                          <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                            <span>{loc.city}</span>
                            <span>•</span>
                            <span className="font-mono text-[10px]">
                              {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Botones de acción compactos */}
                      <div className="flex items-center gap-1 shrink-0">
                        {/* Botón: Centrar en Mapa */}
                        <button
                          onClick={() => handleSelectOnMap(loc)}
                          title="Ver en el mapa"
                          className="rounded p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                        >
                          <Navigation className="h-3.5 w-3.5 text-primary" />
                        </button>

                        {/* Botón: Establecer como Predeterminada del Sistema */}
                        <button
                          type="button"
                          onClick={() => handleSetDefaultLocation('custom', loc.id, loc.name)}
                          title={isDefaultLoc ? 'Ubicación predeterminada general activa' : 'Establecer como ubicación predeterminada general para nuevos contenedores'}
                          className={cn(
                            'rounded p-1.5 transition-colors',
                            isDefaultLoc
                              ? 'text-amber-500 bg-amber-500/15'
                              : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
                          )}
                        >
                          <Star className={cn('h-3.5 w-3.5', isDefaultLoc && 'fill-amber-500')} />
                        </button>

                        {/* Botón: Fijar / Desfijar Pin */}
                        <button
                          type="button"
                          onClick={() => handleTogglePin('custom', loc.id, !loc.is_pinned)}
                          title={loc.is_pinned ? 'Desfijar de accesos rápidos de FocusView' : 'Fijar en accesos rápidos de FocusView'}
                          className={cn(
                            'rounded p-1.5 transition-colors',
                            loc.is_pinned
                              ? 'text-amber-500 bg-amber-500/15 hover:bg-amber-500/25'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                          )}
                        >
                          <Pin className={cn('h-3.5 w-3.5', loc.is_pinned && 'fill-amber-500')} />
                        </button>

                        {/* Botón: Asignar a Contenedor */}
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              title="Asignar a contenedor..."
                              className="flex items-center gap-1 rounded bg-secondary px-2 py-1 text-[11px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                            >
                              <Smartphone className="h-3 w-3 text-primary" />
                              <span className="hidden sm:inline">Asignar</span>
                            </button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-64 p-2">
                            <div className="text-[11px] font-bold text-foreground mb-1.5 px-1 border-b border-border/50 pb-1">
                              Asignar "{loc.name}" a:
                            </div>
                            <div className="max-h-48 overflow-y-auto space-y-1">
                              {instances.length === 0 ? (
                                <p className="text-[11px] text-muted-foreground p-1">No hay instancias creadas.</p>
                              ) : (
                                instances.map((inst) => (
                                  <button
                                    key={inst.instance_name}
                                    onClick={() => handleAssignToInstance(inst.instance_name, loc)}
                                    className="w-full flex items-center justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-accent transition-colors"
                                  >
                                    <div className="flex items-center gap-1.5 truncate">
                                      <span
                                        className={cn(
                                          'h-2 w-2 rounded-full shrink-0',
                                          inst.running ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                                        )}
                                      />
                                      <span className="font-medium text-foreground truncate">{inst.instance_name}</span>
                                    </div>
                                    <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                                      :{inst.adb_port}
                                    </span>
                                  </button>
                                ))
                              )}
                            </div>
                          </PopoverContent>
                        </Popover>

                        {/* Botón: Eliminar */}
                        <button
                          onClick={() => handleDeleteLocation(loc.id, loc.name)}
                          title="Eliminar ubicación"
                          className="rounded p-1.5 text-muted-foreground hover:text-rose-500 hover:bg-rose-500/10 transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Sección Plegable: Presets Oficiales Globales */}
          <div className="rounded-xl border border-border bg-card overflow-hidden shadow-xs">
            <button
              onClick={() => setShowPresetsGlobal(!showPresetsGlobal)}
              className="w-full flex items-center justify-between p-3 text-xs font-semibold text-foreground hover:bg-accent/50 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Globe className="h-3.5 w-3.5 text-primary" />
                <span>Presets Globales Oficiales ({Object.keys(allPresetsMap).length})</span>
                <span className="text-[10px] font-mono text-muted-foreground">
                  ({pinnedPresetsList.length} fijados)
                </span>
              </div>
              {showPresetsGlobal ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </button>

            {showPresetsGlobal && (
              <div className="p-3 border-t border-border space-y-2.5">
                {/* Buscador de presets */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Buscar ciudad o país oficial..."
                    value={presetSearchQuery}
                    onChange={(e) => setPresetSearchQuery(e.target.value)}
                    className="w-full h-8 rounded-lg border border-border bg-background pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs"
                  />
                  {presetSearchQuery && (
                    <button
                      onClick={() => setPresetSearchQuery('')}
                      className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
                  {filteredPresets.map(([key, loc]) => {
                    const isPinned = catalog.pinned_presets?.includes(key.toLowerCase());
                    const isDefaultPreset = catalog.default_location?.target_type === 'preset' && catalog.default_location?.id === key.toLowerCase();
                    return (
                      <div
                        key={key}
                        className={cn(
                          'flex items-center justify-between p-2 rounded-lg border transition-colors group',
                          isDefaultPreset
                            ? 'border-amber-500/50 bg-amber-500/10'
                            : isPinned
                            ? 'border-amber-500/40 bg-amber-500/5'
                            : 'border-border/70 hover:border-primary/50 bg-card hover:bg-accent/30'
                        )}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setMapLat(loc.latitude);
                            setMapLon(loc.longitude);
                            setMapCity(loc.city);
                            setLocName(loc.name);
                            setLocTimezone(loc.timezone || 'America/Argentina/Buenos_Aires');
                            if (loc.altitude) setLocAltitude(loc.altitude);
                            toast.info(`Cargado al mapa: ${loc.city}`);
                          }}
                          className="flex flex-col text-left min-w-0 flex-1 mr-2"
                        >
                          <div className="flex items-center gap-1.5 truncate">
                            <span className="text-[11px] font-bold text-foreground truncate">{loc.name}</span>
                            {isDefaultPreset && (
                              <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 font-bold bg-amber-500/20 px-1 rounded flex items-center gap-0.5">
                                <Star className="h-2.5 w-2.5 fill-amber-500" /> Predeterminada
                              </span>
                            )}
                            {isPinned && !isDefaultPreset && (
                              <span className="text-[9px] font-mono text-amber-600 dark:text-amber-400 font-semibold bg-amber-500/10 px-1 rounded">
                                Fijado
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-muted-foreground truncate">{loc.city}</span>
                          <span className="text-[9px] font-mono text-muted-foreground opacity-70">
                            {loc.latitude.toFixed(2)}, {loc.longitude.toFixed(2)}
                          </span>
                        </button>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleSetDefaultLocation('preset', key, loc.name)}
                            title={isDefaultPreset ? 'Preset predeterminado general activo' : `Establecer ${loc.name} como predeterminada del sistema`}
                            className={cn(
                              'rounded p-1.5 transition-colors',
                              isDefaultPreset
                                ? 'text-amber-500 bg-amber-500/20'
                                : 'text-muted-foreground hover:text-amber-500 hover:bg-amber-500/10'
                            )}
                          >
                            <Star className={cn('h-3.5 w-3.5', isDefaultPreset && 'fill-amber-500')} />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleTogglePin('preset', key, !isPinned)}
                            title={isPinned ? 'Desfijar de accesos rápidos de FocusView' : 'Fijar en accesos rápidos de FocusView'}
                            className={cn(
                              'rounded p-1.5 transition-colors',
                              isPinned
                                ? 'text-amber-500 bg-amber-500/15 hover:bg-amber-500/25'
                                : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                            )}
                          >
                            <Pin className={cn('h-3.5 w-3.5', isPinned && 'fill-amber-500')} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Creador Interactivo Asistido por Mapa (5 Cols) */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-4">
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                <h3 className="text-xs font-bold text-foreground">Fijar Ubicación en Mapa</h3>
              </div>

              <div className="flex items-center gap-2">
                {catalog.default_location && (
                  <button
                    type="button"
                    onClick={() => {
                      setMapLat(catalog.default_location!.latitude);
                      setMapLon(catalog.default_location!.longitude);
                      setMapCity(catalog.default_location!.city);
                      if (catalog.default_location!.timezone) setLocTimezone(catalog.default_location!.timezone);
                      if (catalog.default_location!.altitude) setLocAltitude(catalog.default_location!.altitude);
                      toast.info(`Mapa centrado en predeterminada: ${catalog.default_location!.name}`);
                    }}
                    title={`Centrar mapa en la Ubicación Predeterminada Actual (${catalog.default_location.name})`}
                    className="flex items-center gap-1 rounded bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400 hover:bg-amber-500/25 transition-colors"
                  >
                    <Star className="h-3 w-3 fill-amber-500" />
                    <span>Predeterminada</span>
                  </button>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {mapLat.toFixed(4)}, {mapLon.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Mapa Interactivo Leaflet */}
            <div className="rounded-lg border border-border overflow-hidden h-[220px]">
              <MapPicker
                latitude={mapLat}
                longitude={mapLon}
                city={mapCity}
                height="220px"
                showPresets={false}
                showInfoOverlay={false}
                onChange={(lat, lon, cityName) => {
                  setMapLat(lat);
                  setMapLon(lon);
                  if (cityName) setMapCity(cityName);
                }}
              />
            </div>

            <p className="text-[10px] text-muted-foreground">
              Haz clic o arrastra el marcador para fijar las coordenadas exactas.
            </p>

            {/* Formulario de Creación Rápida */}
            <form onSubmit={handleSaveLocation} className="space-y-3 pt-1 border-t border-border/60">
              <div>
                <label className="block text-[11px] font-semibold text-foreground mb-1">
                  Nombre Personalizado *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Oficina Palermo, Depósito Norte, Sucursal 4..."
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Grupo de Geolocalización
                  </label>
                  <select
                    value={locGroupId}
                    onChange={(e) => setLocGroupId(e.target.value)}
                    className="w-full h-8.5 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">(Sin Grupo)</option>
                    {catalog.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1">
                    Ciudad / Referencia
                  </label>
                  <input
                    type="text"
                    value={mapCity}
                    onChange={(e) => setMapCity(e.target.value)}
                    className="w-full h-8.5 rounded-lg border border-input bg-background px-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Opciones avanzadas de coordenadas (colapsable) */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowAdvancedCoords(!showAdvancedCoords)}
                  className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground"
                >
                  {showAdvancedCoords ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  <span>Parámetros avanzados (Zona Horaria, Altitud)</span>
                </button>

                {showAdvancedCoords && (
                  <div className="grid grid-cols-2 gap-2 pt-2 animate-in fade-in duration-150">
                    <div>
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">Zona Horaria</label>
                      <input
                        type="text"
                        value={locTimezone}
                        onChange={(e) => setLocTimezone(e.target.value)}
                        className="w-full h-7 rounded border border-input bg-background px-2 font-mono text-[11px] text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">Altitud (m)</label>
                      <input
                        type="number"
                        value={locAltitude}
                        onChange={(e) => setLocAltitude(Number(e.target.value))}
                        className="w-full h-7 rounded border border-input bg-background px-2 font-mono text-[11px] text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Opción para fijar directamente en accesos rápidos */}
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={locIsPinned}
                    onChange={(e) => setLocIsPinned(e.target.checked)}
                    className="rounded border-border text-primary focus:ring-primary h-3.5 w-3.5"
                  />
                  <span className="text-xs text-foreground font-medium flex items-center gap-1.5 select-none">
                    <Pin className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span>Fijar en accesos rápidos de FocusView</span>
                  </span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={locSetAsDefault}
                    onChange={(e) => setLocSetAsDefault(e.target.checked)}
                    className="rounded border-border text-amber-500 focus:ring-amber-500 h-3.5 w-3.5"
                  />
                  <span className="text-xs text-foreground font-medium flex items-center gap-1.5 select-none">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span>Establecer como ubicación predeterminada general del sistema</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={savingLoc || !locName.trim()}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-primary h-9 font-semibold text-xs text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm"
              >
                {savingLoc ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                <span>Guardar Ubicación Custom</span>
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Modal / Diálogo para Crear o Editar Grupo */}
      {groupModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <Folder className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-bold text-foreground">
                  {editingGroup ? 'Editar Grupo' : 'Nuevo Grupo de Geolocalizaciones'}
                </h3>
              </div>
              <button
                onClick={() => setGroupModalOpen(false)}
                className="rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveGroup} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Nombre del Grupo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Sedes LATAM, Zonas Bancarias..."
                  value={groupNameInput}
                  onChange={(e) => setGroupNameInput(e.target.value)}
                  className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1.5">Color Distintivo</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {PALETTE_COLORS.map((col) => (
                    <button
                      type="button"
                      key={col}
                      onClick={() => setGroupColorInput(col)}
                      className={cn(
                        'h-6 w-6 rounded-full border-2 transition-transform',
                        groupColorInput === col ? 'scale-110 border-foreground shadow-sm' : 'border-transparent'
                      )}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-foreground mb-1">Descripción (Opcional)</label>
                <input
                  type="text"
                  placeholder="Objetivo o referencia del grupo..."
                  value={groupDescInput}
                  onChange={(e) => setGroupDescInput(e.target.value)}
                  className="w-full h-8.5 rounded-lg border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setGroupModalOpen(false)}
                  className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingGroup || !groupNameInput.trim()}
                  className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {savingGroup && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{editingGroup ? 'Guardar Cambios' : 'Crear Grupo'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
