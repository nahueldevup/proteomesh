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
  Edit2,
  X,
  Pin,
  Star,
  Check,
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
  const [formGroupSelectOpen, setFormGroupSelectOpen] = useState(false);
  const [groupsDropdownOpen, setGroupsDropdownOpen] = useState(false);
  const [groupFilterQuery, setGroupFilterQuery] = useState('');
  const [pinnedPopoverOpen, setPinnedPopoverOpen] = useState(false);
  const [pinnedSearchQuery, setPinnedSearchQuery] = useState('');
  const [locPageSize, setLocPageSize] = useState<number>(15);
  const [locPage, setLocPage] = useState<number>(1);
  const [locPageSizeOpen, setLocPageSizeOpen] = useState(false);

  // Estados para crear/editar grupo
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LocationGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('#10b981');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);

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

  // Lista unificada de accesos rápidos para el Popover
  const combinedPinnedItems = useMemo(() => {
    const items: Array<{
      type: 'custom' | 'preset';
      id: string;
      name: string;
      city: string;
      latitude: number;
      longitude: number;
      timezone?: string;
      altitude?: number;
      groupColor?: string;
    }> = [];

    pinnedPresetsList.forEach((p) => {
      items.push({
        type: 'preset',
        id: p.key,
        name: p.name,
        city: p.city,
        latitude: p.latitude,
        longitude: p.longitude,
        timezone: p.timezone,
        altitude: p.altitude,
      });
    });

    pinnedLocations.forEach((loc) => {
      const grp = loc.group_id ? groupsMap.get(loc.group_id) : null;
      items.push({
        type: 'custom',
        id: loc.id,
        name: loc.name,
        city: loc.city,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: loc.timezone,
        altitude: loc.altitude,
        groupColor: grp?.color,
      });
    });

    return items;
  }, [pinnedPresetsList, pinnedLocations, groupsMap]);

  const filteredPinnedList = useMemo(() => {
    const q = pinnedSearchQuery.trim().toLowerCase();
    if (!q) return combinedPinnedItems;
    return combinedPinnedItems.filter(
      (item) => item.name.toLowerCase().includes(q) || item.city.toLowerCase().includes(q)
    );
  }, [combinedPinnedItems, pinnedSearchQuery]);

  const selectedGroup = useMemo(() => {
    return catalog.groups.find((g) => g.id === selectedGroupId);
  }, [catalog.groups, selectedGroupId]);

  const filteredDropdownGroups = useMemo(() => {
    const q = groupFilterQuery.trim().toLowerCase();
    if (!q) return catalog.groups;
    return catalog.groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [catalog.groups, groupFilterQuery]);

  const totalLocPages = Math.max(1, Math.ceil(filteredLocations.length / locPageSize));
  const paginatedLocations = useMemo(() => {
    return filteredLocations.slice((locPage - 1) * locPageSize, locPage * locPageSize);
  }, [filteredLocations, locPage, locPageSize]);

  useEffect(() => {
    setLocPage(1);
  }, [searchQuery, selectedGroupId, locPageSize]);

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

  const selectedFormGroup = useMemo(() => {
    return catalog.groups.find((g) => g.id === locGroupId);
  }, [catalog.groups, locGroupId]);

  return (
    <div className="flex-1 overflow-auto p-3.5 md:p-5 space-y-3.5">
      {/* Grid Principal: Lista Compacta a la Izquierda / Mapa & Creador a la Derecha */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
        {/* COLUMNA IZQUIERDA: Grupos y Lista Compacta de Ubicaciones (7 Cols) */}
        <div className="lg:col-span-7 space-y-3">
          {/* Banner: Ubicación Predeterminada General del Sistema */}
          <div className="rounded-sm border border-border bg-card p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-sm bg-primary/20 text-foreground border border-primary/40 font-mono">
                  <Star className="h-3.5 w-3.5 fill-current text-primary" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">
                      Ubicación Predeterminada del Sistema
                    </span>
                    <span className="rounded-xs bg-primary/20 px-1.5 py-0.2 text-[9px] font-mono font-bold text-foreground border border-primary/40">
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
                  className="flex items-center gap-1 rounded-sm border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                >
                  <Navigation className="h-3 w-3 text-primary" />
                  <span>Ver en Mapa</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3 pt-1 text-xs border-t border-border flex-wrap">
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

          {/* Barra de Filtro y Gestión de Grupos vía Popover Estandarizado con Scroll */}
          <div className="flex items-center justify-between gap-2 border-b border-border/60 pb-2 font-mono">
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              {/* Botón rápido: Todas */}
              <button
                type="button"
                onClick={() => setSelectedGroupId(null)}
                className={cn(
                  'h-7.5 flex items-center gap-1.5 rounded-sm px-2.5 text-xs font-mono font-medium transition-colors border shrink-0',
                  selectedGroupId === null
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : 'bg-card text-muted-foreground border-border hover:bg-muted hover:text-foreground'
                )}
                title="Mostrar ubicaciones de todos los grupos"
              >
                <Layers className="h-3 w-3" />
                <span>Todas ({catalog.locations.length})</span>
              </button>

              {/* Popover con Scroll para ver, filtrar y gestionar TODOS los grupos */}
              <Popover open={groupsDropdownOpen} onOpenChange={setGroupsDropdownOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'h-7.5 flex items-center justify-between gap-2 rounded-sm border px-2.5 text-xs font-mono font-medium transition-colors shrink-0 max-w-[240px]',
                      selectedGroupId !== null
                        ? 'border-primary/50 bg-primary/20 text-foreground font-bold shadow-xs'
                        : 'border-border bg-card text-foreground hover:bg-muted'
                    )}
                    title="Ver todos los grupos creados, filtrar o gestionarlos"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      {selectedGroup ? (
                        <>
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: selectedGroup.color || '#10b981' }}
                          />
                          <span className="truncate">{selectedGroup.name}</span>
                          <span className="text-[10px] text-muted-foreground opacity-80">
                            ({catalog.locations.filter((l) => l.group_id === selectedGroup.id).length})
                          </span>
                        </>
                      ) : (
                        <>
                          <Folder className="h-3 w-3 text-primary shrink-0" />
                          <span className="truncate">Grupos</span>
                          <span className="text-[10px] text-muted-foreground">({catalog.groups.length})</span>
                        </>
                      )}
                    </div>
                    <ChevronDown className={cn("h-3 w-3 opacity-60 shrink-0 transition-transform duration-200", groupsDropdownOpen && "rotate-180")} />
                  </button>
                </PopoverTrigger>

                <PopoverContent align="start" sideOffset={4} className="w-80 p-2 space-y-1.5 font-mono shadow-2xl">
                  {/* Cabecera del Popover */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5 px-1">
                    <div className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5 text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                        Grupos Creados ({catalog.groups.length})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setGroupsDropdownOpen(false);
                        openNewGroupModal();
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-primary hover:underline"
                    >
                      <Plus className="h-3 w-3" />
                      <span>Nuevo Grupo</span>
                    </button>
                  </div>

                  {/* Buscador interno de grupos si hay más de 3 */}
                  {catalog.groups.length > 3 && (
                    <div className="relative px-0.5">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar grupo..."
                        value={groupFilterQuery}
                        onChange={(e) => setGroupFilterQuery(e.target.value)}
                        className="w-full h-7 rounded-xs border border-border bg-background pl-7 pr-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {/* Opción rápida: Ver Todas */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedGroupId(null);
                      setGroupsDropdownOpen(false);
                    }}
                    className={cn(
                      "w-full flex items-center justify-between rounded-xs px-2 py-1.5 text-xs text-left transition-colors",
                      selectedGroupId === null
                        ? "bg-primary/20 text-foreground font-bold"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Layers className="h-3 w-3 text-muted-foreground" />
                      <span>Todas las Ubicaciones</span>
                    </div>
                    <span className="text-[10px] font-mono opacity-60">({catalog.locations.length})</span>
                  </button>

                  {/* Lista Vertical con Scroll de TODOS los grupos creados */}
                  <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 divide-y divide-border/30">
                    {filteredDropdownGroups.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground">
                        {catalog.groups.length === 0
                          ? "No hay grupos creados aún."
                          : `No se encontró ningún grupo para "${groupFilterQuery}".`}
                      </div>
                    ) : (
                      filteredDropdownGroups.map((group) => {
                        const count = catalog.locations.filter((l) => l.group_id === group.id).length;
                        const isSelected = selectedGroupId === group.id;

                        return (
                          <div
                            key={group.id}
                            className={cn(
                              "flex items-center justify-between rounded-xs px-2 py-1 text-xs transition-colors group/item",
                              isSelected
                                ? "bg-primary/20 text-foreground font-bold"
                                : "hover:bg-muted/60 text-foreground"
                            )}
                          >
                            {/* Clic en el grupo para filtrar */}
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedGroupId(group.id);
                                setGroupsDropdownOpen(false);
                              }}
                              className="flex-1 min-w-0 flex items-center gap-2 text-left"
                              title={`Filtrar por ${group.name} (${count} ubicaciones)`}
                            >
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: group.color || '#10b981' }}
                              />
                              <span className="truncate font-medium">{group.name}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0 opacity-70">
                                ({count})
                              </span>
                            </button>

                            {/* Acciones de Editar y Eliminar en cada fila */}
                            <div className="flex items-center gap-1 shrink-0 ml-2">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setGroupsDropdownOpen(false);
                                  openEditGroupModal(group);
                                }}
                                title={`Editar grupo "${group.name}"`}
                                className="h-6 w-6 rounded-xs flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background border border-transparent hover:border-border transition-colors"
                              >
                                <Edit2 className="h-3 w-3" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteGroup(group.id, group.name);
                                }}
                                title={`Eliminar grupo "${group.name}"`}
                                className="h-6 w-6 rounded-xs flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Popover con Scroll para ver y gestionar los Accesos Rápidos de FocusView */}
              <Popover open={pinnedPopoverOpen} onOpenChange={setPinnedPopoverOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'h-7.5 flex items-center justify-between gap-1.5 rounded-sm border px-2.5 text-xs font-mono font-medium transition-colors shrink-0',
                      combinedPinnedItems.length > 0
                        ? 'border-border bg-card text-foreground hover:bg-muted'
                        : 'border-border bg-card text-muted-foreground hover:bg-muted'
                    )}
                    title="Ver y gestionar accesos rápidos fijados en FocusView"
                  >
                    <div className="flex items-center gap-1.5 truncate">
                      <Pin className={cn("h-3 w-3", combinedPinnedItems.length > 0 ? "text-primary fill-current" : "text-muted-foreground")} />
                      <span>Accesos Rápidos</span>
                      <span className="text-[10px] text-muted-foreground">({combinedPinnedItems.length})</span>
                    </div>
                    <ChevronDown className={cn("h-3 w-3 opacity-60 shrink-0 transition-transform duration-200", pinnedPopoverOpen && "rotate-180")} />
                  </button>
                </PopoverTrigger>

                <PopoverContent align="start" sideOffset={4} className="w-80 p-2 space-y-1.5 font-mono shadow-2xl">
                  {/* Cabecera del Popover */}
                  <div className="flex items-center justify-between border-b border-border/60 pb-1.5 px-1">
                    <div className="flex items-center gap-1.5">
                      <Pin className="h-3.5 w-3.5 text-primary fill-current" />
                      <span className="text-[11px] font-bold uppercase tracking-wider text-foreground">
                        Accesos Rápidos FocusView ({combinedPinnedItems.length})
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">Fijados</span>
                  </div>

                  {/* Buscador interno si hay varios fijados */}
                  {combinedPinnedItems.length > 3 && (
                    <div className="relative px-0.5">
                      <Search className="absolute left-2.5 top-2 h-3 w-3 text-muted-foreground" />
                      <input
                        type="text"
                        placeholder="Buscar acceso rápido..."
                        value={pinnedSearchQuery}
                        onChange={(e) => setPinnedSearchQuery(e.target.value)}
                        className="w-full h-7 rounded-xs border border-border bg-background pl-7 pr-2 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                      />
                    </div>
                  )}

                  {/* Lista con Scroll Vertical de Accesos Rápidos */}
                  <div className="max-h-56 overflow-y-auto space-y-0.5 pr-0.5 divide-y divide-border/30">
                    {filteredPinnedList.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground px-2">
                        {combinedPinnedItems.length === 0
                          ? "No hay accesos rápidos fijados. Fija ubicaciones con el icono de pin (📌) en la lista de abajo."
                          : `No se encontró ningún acceso rápido para \"${pinnedSearchQuery}\".`}
                      </div>
                    ) : (
                      filteredPinnedList.map((item) => (
                        <div
                          key={`${item.type}-${item.id}`}
                          className="flex items-center justify-between rounded-xs px-2 py-1 text-xs hover:bg-muted/60 text-foreground transition-colors group/pinned"
                        >
                          {/* Clic para centrar en mapa */}
                          <button
                            type="button"
                            onClick={() => {
                              setMapLat(item.latitude);
                              setMapLon(item.longitude);
                              setMapCity(item.city);
                              if (item.timezone) setLocTimezone(item.timezone);
                              if (item.altitude) setLocAltitude(item.altitude);
                              toast.info(`Centrado en: ${item.name}`);
                              setPinnedPopoverOpen(false);
                            }}
                            className="flex-1 min-w-0 flex items-center gap-2 text-left"
                            title={`Centrar en mapa: ${item.name} (${item.city})`}
                          >
                            {item.type === 'custom' ? (
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: item.groupColor || '#10b981' }}
                              />
                            ) : (
                              <Globe className="h-3 w-3 text-primary shrink-0" />
                            )}
                            <div className="truncate flex-1">
                              <span className="font-medium text-foreground">{item.name}</span>
                              <span className="text-[10px] text-muted-foreground ml-1">({item.city})</span>
                            </div>
                          </button>

                          {/* Botón para Desfijar */}
                          <button
                            type="button"
                            onClick={() => handleTogglePin(item.type, item.id, false)}
                            title={`Desfijar ${item.name} de FocusView`}
                            className="h-6 w-6 rounded-xs flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors ml-1 shrink-0"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-1 border-t border-border/50 px-1 text-[10px] text-muted-foreground">
                    Aparecen directamente como accesos rápidos en la barra GPS de FocusView.
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            {/* Botón "+ Nuevo Grupo" */}
            <button
              type="button"
              onClick={openNewGroupModal}
              className="h-7.5 flex items-center gap-1.5 rounded-sm border border-dashed border-border hover:border-primary/60 bg-card px-2.5 text-xs font-mono font-medium text-foreground hover:bg-muted transition-colors shrink-0 shadow-xs"
              title="Crear un nuevo grupo de geolocalizaciones"
            >
              <FolderPlus className="h-3.5 w-3.5 text-primary" />
              <span>+ Nuevo Grupo</span>
            </button>
          </div>

          {/* Buscador Rápido */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Buscar por nombre personalizado o ciudad..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-8 rounded-sm border border-border bg-card pl-8 pr-3 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary shadow-xs font-mono"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2 text-muted-foreground hover:text-foreground p-0.5"
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
              <div className="rounded-sm border border-dashed border-border bg-card/50 p-8 text-center font-mono">
                <MapPin className="mx-auto h-7 w-7 text-muted-foreground/50 mb-2" />
                <p className="text-xs font-semibold text-foreground">No hay ubicaciones en esta vista</p>
                <p className="text-[11px] text-muted-foreground mt-1 font-sans">
                  Usa el mapa interactivo de la derecha para fijar coordenadas y guardarlas.
                </p>
              </div>
            ) : (
              <>
                {/* Tabla de Ubicaciones con Scroll Interno y Cabecera Pegajosa */}
                <div className="overflow-x-auto rounded-sm border border-border bg-card max-h-[380px] overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border bg-card font-mono text-[10px] font-bold text-muted-foreground uppercase tracking-wider shadow-xs">
                      <tr>
                        <th className="px-3 py-2 bg-card">Ubicación & Grupo</th>
                        <th className="px-3 py-2 bg-card">Ciudad & Coordenadas</th>
                        <th className="px-3 py-2 bg-card">Estado</th>
                        <th className="px-3 py-2 bg-card text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-[11px]">
                      {paginatedLocations.map((loc) => {
                        const grp = loc.group_id ? groupsMap.get(loc.group_id) : null;
                        const isDefaultLoc = catalog.default_location?.id === loc.id;
                        return (
                          <tr key={loc.id} className="hover:bg-muted/30 transition-colors">
                            {/* Ubicación & Grupo */}
                            <td className="px-3 py-1.5 align-middle">
                              <div className="flex items-center gap-2">
                                <div
                                  className="h-2 w-2 rounded-full shrink-0 shadow-xs"
                                  style={{ backgroundColor: grp?.color || '#94a3b8' }}
                                  title={grp?.name || 'Sin grupo'}
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-foreground text-xs font-sans truncate">
                                    {loc.name}
                                  </div>
                                  <div className="text-[10px] text-muted-foreground font-mono">
                                    {grp ? grp.name : '(Sin grupo)'}
                                  </div>
                                </div>
                              </div>
                            </td>

                            {/* Ciudad y Coordenadas */}
                            <td className="px-3 py-1.5 align-middle">
                              <div className="truncate text-foreground font-sans text-xs">
                                {loc.city}
                              </div>
                              <div className="text-[10px] font-mono text-muted-foreground">
                                {loc.latitude.toFixed(4)}, {loc.longitude.toFixed(4)}
                              </div>
                            </td>

                            {/* Badges de Estado */}
                            <td className="px-3 py-1.5 align-middle">
                              <div className="flex items-center gap-1 flex-wrap">
                                {isDefaultLoc && (
                                  <span className="inline-flex items-center gap-1 rounded-xs bg-primary/20 border border-primary/40 px-1.5 py-0.2 text-[9px] font-bold text-foreground">
                                    <Star className="h-2.5 w-2.5 fill-current text-primary" />
                                    Predeterminada
                                  </span>
                                )}
                                {loc.is_pinned && (
                                  <span className="inline-flex items-center gap-1 rounded-xs bg-card border border-border px-1.5 py-0.2 text-[9px] font-medium text-foreground">
                                    <Pin className="h-2.5 w-2.5 fill-current text-primary" />
                                    Fijada
                                  </span>
                                )}
                                {!isDefaultLoc && !loc.is_pinned && (
                                  <span className="text-[10px] text-muted-foreground">—</span>
                                )}
                              </div>
                            </td>

                            {/* Acciones compactas */}
                            <td className="px-3 py-1.5 align-middle text-right">
                              <div className="inline-flex items-center justify-end gap-1">
                                {/* Botón: Centrar en Mapa */}
                                <button
                                  type="button"
                                  onClick={() => handleSelectOnMap(loc)}
                                  title="Ver y centrar en el mapa"
                                  className="h-6 w-6 rounded-xs flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors border border-transparent hover:border-border"
                                >
                                  <Navigation className="h-3 w-3 text-primary" />
                                </button>

                                {/* Botón: Establecer como Predeterminada */}
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultLocation('custom', loc.id, loc.name)}
                                  title={isDefaultLoc ? 'Ubicación predeterminada general activa' : `Establecer ${loc.name} como predeterminada general`}
                                  className={cn(
                                    'h-6 w-6 rounded-xs flex items-center justify-center transition-colors border border-transparent',
                                    isDefaultLoc
                                      ? 'text-foreground bg-primary/20 border-primary/40'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border'
                                  )}
                                >
                                  <Star className={cn('h-3 w-3', isDefaultLoc ? 'fill-current text-primary' : '')} />
                                </button>

                                {/* Botón: Fijar / Desfijar Pin */}
                                <button
                                  type="button"
                                  onClick={() => handleTogglePin('custom', loc.id, !loc.is_pinned)}
                                  title={loc.is_pinned ? 'Desfijar de FocusView' : 'Fijar en accesos rápidos de FocusView'}
                                  className={cn(
                                    'h-6 w-6 rounded-xs flex items-center justify-center transition-colors border border-transparent',
                                    loc.is_pinned
                                      ? 'text-foreground bg-primary/20 border-primary/40'
                                      : 'text-muted-foreground hover:text-foreground hover:bg-muted hover:border-border'
                                  )}
                                >
                                  <Pin className={cn('h-3 w-3', loc.is_pinned ? 'fill-current text-primary' : '')} />
                                </button>

                                {/* Botón: Asignar a Contenedor */}
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <button
                                      type="button"
                                      title="Asignar a CloudPhone..."
                                      className="inline-flex items-center gap-1 h-6 px-1.5 rounded-xs border border-border bg-card text-[10px] font-mono font-medium text-foreground hover:bg-muted transition-colors"
                                    >
                                      <Smartphone className="h-2.5 w-2.5 text-primary" />
                                      <span>Asignar</span>
                                    </button>
                                  </PopoverTrigger>
                                  <PopoverContent align="end" sideOffset={4} className="w-64 p-2 font-mono shadow-2xl">
                                    <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5 px-1 border-b border-border/50 pb-1">
                                      Asignar "{loc.name}" a:
                                    </div>
                                    <div className="max-h-48 overflow-y-auto space-y-0.5 pr-0.5">
                                      {instances.length === 0 ? (
                                        <p className="text-[11px] text-muted-foreground p-1 font-sans">No hay instancias creadas.</p>
                                      ) : (
                                        instances.map((inst) => (
                                          <button
                                            key={inst.instance_name}
                                            type="button"
                                            onClick={() => handleAssignToInstance(inst.instance_name, loc)}
                                            className="w-full flex items-center justify-between rounded-xs px-2 py-1 text-left text-xs hover:bg-muted transition-colors"
                                          >
                                            <div className="flex items-center gap-1.5 truncate">
                                              <span
                                                className={cn(
                                                  'h-1.5 w-1.5 rounded-full shrink-0',
                                                  inst.running ? 'bg-success' : 'bg-muted-foreground/40'
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
                                  type="button"
                                  onClick={() => handleDeleteLocation(loc.id, loc.name)}
                                  title={`Eliminar "${loc.name}"`}
                                  className="h-6 w-6 rounded-xs flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/15 transition-colors"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Barra de Paginación y Contador de Ubicaciones */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-t border-border/60 text-[11px] font-mono">
                  <span className="text-muted-foreground">
                    Mostrando {filteredLocations.length === 0 ? 0 : (locPage - 1) * locPageSize + 1} - {Math.min(locPage * locPageSize, filteredLocations.length)} de {filteredLocations.length} ubicaciones
                  </span>

                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <span className="text-muted-foreground text-[10px]">Límite:</span>
                      <Popover open={locPageSizeOpen} onOpenChange={setLocPageSizeOpen}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="h-6 flex items-center gap-1 rounded-xs border border-border bg-card px-1.5 text-[10px] font-mono text-foreground hover:bg-muted transition-colors"
                            title="Cambiar límite de registros por página"
                          >
                            <span>{locPageSize}</span>
                            <ChevronDown className={cn("h-2.5 w-2.5 opacity-60 transition-transform duration-200", locPageSizeOpen && "rotate-180")} />
                          </button>
                        </PopoverTrigger>
                        <PopoverContent side="top" align="center" sideOffset={4} className="w-20 p-1 space-y-0.5 font-mono text-[10px] shadow-xl">
                          {[10, 15, 25, 50].map((size) => (
                            <button
                              key={size}
                              type="button"
                              onClick={() => {
                                setLocPageSize(size);
                                setLocPage(1);
                                setLocPageSizeOpen(false);
                              }}
                              className={cn(
                                "w-full flex items-center justify-between rounded-xs px-2 py-1 text-[10px] font-mono text-left transition-colors",
                                locPageSize === size
                                  ? "bg-primary/20 text-foreground font-bold"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                            >
                              <span>{size}</span>
                              {locPageSize === size && <Check className="h-2.5 w-2.5 text-primary" />}
                            </button>
                          ))}
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={locPage <= 1}
                        onClick={() => setLocPage((p) => Math.max(1, p - 1))}
                        className="h-6 px-2 rounded-xs border border-border bg-card text-[10px] font-mono font-medium text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        Anterior
                      </button>
                      <span className="px-1 text-[10px] font-mono text-muted-foreground">
                        {locPage} / {totalLocPages}
                      </span>
                      <button
                        type="button"
                        disabled={locPage >= totalLocPages}
                        onClick={() => setLocPage((p) => Math.min(totalLocPages, p + 1))}
                        className="h-6 px-2 rounded-xs border border-border bg-card text-[10px] font-mono font-medium text-foreground hover:bg-muted disabled:opacity-30 transition-colors"
                      >
                        Siguiente
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* COLUMNA DERECHA: Creador Interactivo Asistido por Mapa (5 Cols) */}
        <div className="lg:col-span-5 space-y-3 lg:sticky lg:top-3.5">
          <div className="rounded-sm border border-border bg-card p-3.5 space-y-3">
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
                <label className="block text-[11px] font-semibold text-foreground mb-1 font-mono">
                  Nombre Personalizado *
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Oficina Palermo, Depósito Norte, Sucursal 4..."
                  value={locName}
                  onChange={(e) => setLocName(e.target.value)}
                  className="w-full h-8 rounded-sm border border-input bg-background px-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1 font-mono">
                    Grupo de Geolocalización
                  </label>
                  <Popover open={formGroupSelectOpen} onOpenChange={setFormGroupSelectOpen}>
                    <PopoverTrigger asChild>
                      <button
                        type="button"
                        className="w-full h-8 flex items-center justify-between rounded-sm border border-border bg-background px-2.5 text-xs text-foreground hover:bg-muted/40 transition-colors focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {selectedFormGroup ? (
                            <>
                              <span
                                className="h-2 w-2 rounded-full shrink-0"
                                style={{ backgroundColor: selectedFormGroup.color || '#10b981' }}
                              />
                              <span className="truncate font-medium">{selectedFormGroup.name}</span>
                            </>
                          ) : (
                            <span className="text-muted-foreground font-mono text-[11px]">(Sin Grupo)</span>
                          )}
                        </div>
                        <ChevronDown className={cn("h-3 w-3 opacity-60 shrink-0 transition-transform duration-200", formGroupSelectOpen && "rotate-180")} />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="start" sideOffset={4} className="w-56 p-1 space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          setLocGroupId('');
                          setFormGroupSelectOpen(false);
                        }}
                        className={cn(
                          "w-full flex items-center gap-1.5 rounded-xs px-2 py-1 text-xs text-left font-mono transition-colors",
                          locGroupId === '' ? "bg-primary/20 text-foreground font-bold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <span>(Sin Grupo)</span>
                      </button>
                      {catalog.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setLocGroupId(g.id);
                            setFormGroupSelectOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center gap-2 rounded-xs px-2 py-1 text-xs text-left font-mono transition-colors",
                            locGroupId === g.id ? "bg-primary/20 text-foreground font-bold" : "text-foreground hover:bg-muted"
                          )}
                        >
                          <span
                            className="h-2 w-2 rounded-full shrink-0"
                            style={{ backgroundColor: g.color || '#10b981' }}
                          />
                          <span className="truncate flex-1">{g.name}</span>
                          {locGroupId === g.id && <Check className="h-3 w-3 text-primary ml-auto" />}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-foreground mb-1 font-mono">
                    Ciudad / Referencia
                  </label>
                  <input
                    type="text"
                    value={mapCity}
                    onChange={(e) => setMapCity(e.target.value)}
                    className="w-full h-8 rounded-sm border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-medium"
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
                        className="w-full h-7 rounded-sm border border-input bg-background px-2 font-mono text-[11px] text-foreground"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-mono text-muted-foreground mb-0.5">Altitud (m)</label>
                      <input
                        type="number"
                        value={locAltitude}
                        onChange={(e) => setLocAltitude(Number(e.target.value))}
                        className="w-full h-7 rounded-sm border border-input bg-background px-2 font-mono text-[11px] text-foreground"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Opción para fijar directamente en accesos rápidos con Checkboxes Personalizados */}
              <div className="space-y-1.5 pt-0.5">
                <label className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-sm border border-border/60 hover:border-border bg-card/40 transition-colors select-none">
                  <div
                    className={cn(
                      "h-4 w-4 rounded-xs border flex items-center justify-center transition-colors shrink-0",
                      locIsPinned
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                    )}
                  >
                    {locIsPinned && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={locIsPinned}
                    onChange={(e) => setLocIsPinned(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-xs text-foreground font-medium flex items-center gap-1.5">
                    <Pin className="h-3 w-3 text-primary fill-current" />
                    <span>Fijar en accesos rápidos de FocusView</span>
                  </span>
                </label>

                <label className="flex items-center gap-2.5 cursor-pointer p-1.5 rounded-sm border border-border/60 hover:border-border bg-card/40 transition-colors select-none">
                  <div
                    className={cn(
                      "h-4 w-4 rounded-xs border flex items-center justify-center transition-colors shrink-0",
                      locSetAsDefault
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                    )}
                  >
                    {locSetAsDefault && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <input
                    type="checkbox"
                    checked={locSetAsDefault}
                    onChange={(e) => setLocSetAsDefault(e.target.checked)}
                    className="sr-only"
                  />
                  <span className="text-xs text-foreground font-medium flex items-center gap-1.5">
                    <Star className="h-3 w-3 text-primary fill-current" />
                    <span>Establecer como ubicación predeterminada general del sistema</span>
                  </span>
                </label>
              </div>

              <button
                type="submit"
                disabled={savingLoc || !locName.trim()}
                className="w-full flex items-center justify-center gap-1.5 rounded-sm bg-primary h-8.5 font-bold font-mono text-xs text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-50 shadow-xs"
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
