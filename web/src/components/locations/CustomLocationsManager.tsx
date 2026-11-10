import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  MapPin,
  MapPinPlus,
  Plus,
  Trash2,
  Smartphone,
  Search,
  Loader2,
  Folder,
  Layers,
  ChevronDown,
  ChevronRight,
  Globe,
  Edit2,
  X,
  Pin,
  Star,
  Check,
  CircleDot,
  Copy,
  Crosshair,
  LocateFixed,
  ScanSearch,
  Navigation,
  MousePointerClick,
  SearchX,
} from 'lucide-react';
import type { CustomLocation, LocationGroup, Instance, LocationData, CustomLocationsCatalog } from '../../types';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useLocationsCatalog, EMPTY_CATALOG, queryKeys } from '../../lib/queries';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { Switch } from '../ui/switch';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { toast } from 'sonner';
import { cn, getErrorMessage } from '../../lib/utils';
import { getPresetDisplay } from '../../lib/locations';
import type { MapPickerHandle, MapPinItem } from '../MapPicker';

const MapPicker = lazy(() => import('../MapPicker').then((m) => ({ default: m.MapPicker })));

interface CustomLocationsManagerProps {
  instances: Instance[];
  onRefreshInstances?: () => void;
  locationPresets?: Record<string, LocationData>;
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

const UNGROUPED_COLOR = '#94a3b8';
const DEFAULT_TZ = 'America/Argentina/Buenos_Aires';
const DEFAULT_PRESET_MARKER_ID = '__default__';
const COORD_EPSILON = 0.0005;

type Scope = 'all' | 'pinned';
type JobState = 'running' | 'ok' | 'fail';

/** UTC±H legible a partir de una zona IANA. */
function formatUtcOffset(tz?: string): string {
  try {
    const part = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', timeZoneName: 'shortOffset' })
      .formatToParts(new Date())
      .find((p) => p.type === 'timeZoneName');
    const raw = part?.value ?? 'GMT';
    return raw === 'GMT' ? 'UTC' : raw.replace('GMT', 'UTC').replace('-', '−');
  } catch {
    return '—';
  }
}

const sameCoords = (aLat: number, aLon: number, bLat: number, bLon: number) =>
  Math.abs(aLat - bLat) < COORD_EPSILON && Math.abs(aLon - bLon) < COORD_EPSILON;

/** Un CloudPhone está "en" una ubicación si la referencia por id o si sus coordenadas coinciden. */
function isPhoneAtLocation(inst: Instance, loc: CustomLocation) {
  const l = inst.location;
  if (!l) return false;
  if (l.custom_location_id) return l.custom_location_id === loc.id;
  return sameCoords(l.latitude, l.longitude, loc.latitude, loc.longitude);
}

const fieldClass =
  'h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary';
const fieldLabelClass = 'mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground';
const toolbarBtnClass =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-2.5 font-mono text-xs font-medium transition-colors cursor-pointer';
const sectionTitleClass = 'text-[11px] font-medium uppercase tracking-wider text-muted-foreground';

export const CustomLocationsManager: React.FC<CustomLocationsManagerProps> = ({
  instances,
  onRefreshInstances,
  locationPresets = {},
}) => {
  const queryClient = useQueryClient();
  const { data: catalog = EMPTY_CATALOG, isLoading: loading } = useLocationsCatalog();
  const mapHandleRef = useRef<MapPickerHandle>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Filtros de la barra de herramientas
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [scope, setScope] = useState<Scope>('all');
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [groupsDropdownOpen, setGroupsDropdownOpen] = useState(false);
  const [groupFilterQuery, setGroupFilterQuery] = useState('');
  const [pinnedPopoverOpen, setPinnedPopoverOpen] = useState(false);
  const [pinnedSearchQuery, setPinnedSearchQuery] = useState('');

  // Selección del inspector y modo creación
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Estados del creador interactivo en el mapa (marcador arrastrable + formulario)
  const [mapLat, setMapLat] = useState(-34.603722);
  const [mapLon, setMapLon] = useState(-58.381592);
  const [mapCity, setMapCity] = useState('Buenos Aires');
  const [locName, setLocName] = useState('');
  const [locGroupId, setLocGroupId] = useState<string>('');
  const [locTimezone, setLocTimezone] = useState(DEFAULT_TZ);
  const [locAltitude, setLocAltitude] = useState(25);
  const [locIsPinned, setLocIsPinned] = useState(false);
  const [locSetAsDefault, setLocSetAsDefault] = useState(false);
  const [locShowRadius, setLocShowRadius] = useState(true);
  const [locRadiusKm, setLocRadiusKm] = useState(1.0);
  const [savingLoc, setSavingLoc] = useState(false);
  const [showAllRadii, setShowAllRadii] = useState(true);

  // Estados para editar ubicación completa
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingLoc, setEditingLoc] = useState<CustomLocation | null>(null);
  const [editName, setEditName] = useState('');
  const [editCity, setEditCity] = useState('');
  const [editGroupId, setEditGroupId] = useState('');
  const [editTimezone, setEditTimezone] = useState(DEFAULT_TZ);
  const [editAltitude, setEditAltitude] = useState(25);
  const [editRadiusKm, setEditRadiusKm] = useState(1.0);
  const [editShowRadius, setEditShowRadius] = useState(true);
  const [savingEditLoc, setSavingEditLoc] = useState(false);
  const [editGroupSelectOpen, setEditGroupSelectOpen] = useState(false);
  const [formGroupSelectOpen, setFormGroupSelectOpen] = useState(false);

  // Teletransporte
  const [targets, setTargets] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Record<string, JobState>>({});
  const [teleporting, setTeleporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Crear/editar/eliminar grupo y eliminar ubicación
  const [groupModalOpen, setGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<LocationGroup | null>(null);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupColorInput, setGroupColorInput] = useState('#10b981');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [savingGroup, setSavingGroup] = useState(false);
  const [groupToDelete, setGroupToDelete] = useState<LocationGroup | null>(null);
  const [locToDelete, setLocToDelete] = useState<CustomLocation | null>(null);

  const isMapInitializedRef = useRef(false);

  // Inicializar el mapa con la ubicación predeterminada general al cargar
  useEffect(() => {
    if (!isMapInitializedRef.current && catalog.default_location) {
      isMapInitializedRef.current = true;
      setMapLat(catalog.default_location.latitude);
      setMapLon(catalog.default_location.longitude);
      setMapCity(catalog.default_location.city);
      if (catalog.default_location.timezone) setLocTimezone(catalog.default_location.timezone);
      if (catalog.default_location.altitude) setLocAltitude(catalog.default_location.altitude);
    }
  }, [catalog.default_location]);

  /* ── Derivados ─────────────────────────────────────────────────────────── */

  const groupsMap = useMemo(() => {
    const map = new Map<string, LocationGroup>();
    catalog.groups.forEach((g) => map.set(g.id, g));
    return map;
  }, [catalog.groups]);

  const pinnedLocations = useMemo(() => catalog.locations.filter((loc) => loc.is_pinned), [catalog.locations]);

  const pinnedPresetsList = useMemo(() => {
    const list = catalog.pinned_presets || ['ba', 'sao-paulo', 'miami', 'new-york'];
    return list.map((key) => getPresetDisplay(key, locationPresets));
  }, [catalog.pinned_presets, locationPresets]);

  const phonesByLocation = useMemo(() => {
    const map = new Map<string, Instance[]>();
    catalog.locations.forEach((loc) => {
      map.set(
        loc.id,
        instances.filter((inst) => isPhoneAtLocation(inst, loc))
      );
    });
    return map;
  }, [catalog.locations, instances]);

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const visibleLocations = useMemo(() => {
    return catalog.locations.filter((loc) => {
      const matchGroup = selectedGroupId ? loc.group_id === selectedGroupId : true;
      const matchScope = scope === 'all' || !!loc.is_pinned;
      const matchQuery = normalizedQuery
        ? loc.name.toLowerCase().includes(normalizedQuery) || loc.city.toLowerCase().includes(normalizedQuery)
        : true;
      return matchGroup && matchScope && matchQuery;
    });
  }, [catalog.locations, selectedGroupId, scope, normalizedQuery]);

  const sel = useMemo(
    () => (selectedId ? catalog.locations.find((l) => l.id === selectedId) ?? null : null),
    [catalog.locations, selectedId]
  );

  const defaultLoc = catalog.default_location;
  const defaultIsCustom = !!defaultLoc?.id && catalog.locations.some((l) => l.id === defaultLoc.id);

  // Pines del mapa con los teléfonos asignados para el tooltip
  const markers = useMemo<MapPinItem[]>(() => {
    const list = sel && !visibleLocations.some((l) => l.id === sel.id) ? [...visibleLocations, sel] : visibleLocations;
    const items: MapPinItem[] = list.map((loc) => {
      const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
      return {
        id: loc.id,
        name: loc.name,
        lat: loc.latitude,
        lon: loc.longitude,
        city: loc.city,
        color: grp?.color || UNGROUPED_COLOR,
        groupName: grp?.name,
        isDefault: defaultLoc?.id === loc.id,
        isPinned: !!loc.is_pinned,
        radius_km: loc.radius_km ?? 1.0,
        show_radius: loc.show_radius ?? true,
        phones: (phonesByLocation.get(loc.id) ?? []).map((p) => ({ name: p.instance_name, online: p.running })),
      };
    });
    if (defaultLoc && !defaultIsCustom) {
      items.push({
        id: DEFAULT_PRESET_MARKER_ID,
        name: defaultLoc.name,
        lat: defaultLoc.latitude,
        lon: defaultLoc.longitude,
        city: defaultLoc.city,
        color: '#f59e0b',
        isDefault: true,
        radius_km: 1.0,
        show_radius: true,
        phones: instances
          .filter((i) => i.location && sameCoords(i.location.latitude, i.location.longitude, defaultLoc.latitude, defaultLoc.longitude))
          .map((p) => ({ name: p.instance_name, online: p.running })),
      });
    }
    return items;
  }, [visibleLocations, sel, groupsMap, defaultLoc, defaultIsCustom, phonesByLocation, instances]);

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

  const selectedGroup = useMemo(
    () => catalog.groups.find((g) => g.id === selectedGroupId),
    [catalog.groups, selectedGroupId]
  );

  const filteredDropdownGroups = useMemo(() => {
    const q = groupFilterQuery.trim().toLowerCase();
    if (!q) return catalog.groups;
    return catalog.groups.filter((g) => g.name.toLowerCase().includes(q));
  }, [catalog.groups, groupFilterQuery]);

  const selectedFormGroup = useMemo(
    () => catalog.groups.find((g) => g.id === locGroupId),
    [catalog.groups, locGroupId]
  );

  const onlineCount = instances.filter((p) => p.running).length;
  const geolocatedCount = instances.filter((p) => !!p.location).length;
  const pinnedCount = pinnedLocations.length;
  const filtersActive = !!normalizedQuery || scope !== 'all' || !!selectedGroupId;
  const searchResults = normalizedQuery ? visibleLocations.slice(0, 6) : [];
  const selPhones = sel ? phonesByLocation.get(sel.id) ?? [] : [];
  const selGroup = sel?.group_id ? groupsMap.get(sel.group_id) : undefined;
  const selColor = selGroup?.color || UNGROUPED_COLOR;
  const selIsDefault = !!sel && defaultLoc?.id === sel.id;

  /* ── Navegación del mapa ───────────────────────────────────────────────── */

  const resetTeleport = () => {
    setTargets([]);
    setJobs({});
  };

  const selectLocation = (loc: CustomLocation) => {
    setSelectedId(loc.id);
    setCreating(false);
    resetTeleport();
    setCopied(false);
    mapHandleRef.current?.flyTo(loc.latitude, loc.longitude);
  };

  const closeInspector = () => {
    setSelectedId(null);
    resetTeleport();
  };

  const startCreate = (coords?: { lat: number; lon: number }) => {
    const center = coords ?? mapHandleRef.current?.getCenter() ?? null;
    if (center) {
      setMapLat(Number(center.lat.toFixed(6)));
      setMapLon(Number(center.lon.toFixed(6)));
    }
    setLocShowRadius(true);
    setLocRadiusKm(1.0);
    setSelectedId(null);
    resetTeleport();
    setCreating(true);
  };

  const cancelCreate = () => {
    setCreating(false);
    setFormGroupSelectOpen(false);
    setLocShowRadius(true);
    setLocRadiusKm(1.0);
  };

  const centerOnDefault = () => {
    if (!defaultLoc) return;
    const match = defaultLoc.id ? catalog.locations.find((l) => l.id === defaultLoc.id) : undefined;
    if (match) {
      selectLocation(match);
    } else {
      mapHandleRef.current?.flyTo(defaultLoc.latitude, defaultLoc.longitude);
    }
    toast.info(`Centrado en predeterminada: ${defaultLoc.name}`);
  };

  const handleMarkerClick = (id: string) => {
    if (id === DEFAULT_PRESET_MARKER_ID) {
      centerOnDefault();
      return;
    }
    const loc = catalog.locations.find((l) => l.id === id);
    if (loc) selectLocation(loc);
  };

  const handleMapChange = (lat: number, lon: number, cityName?: string) => {
    setMapLat(lat);
    setMapLon(lon);
    if (cityName) setMapCity(cityName);
    if (!creating) {
      setSelectedId(null);
      resetTeleport();
      setCreating(true);
    }
  };

  const changeSelectedGroupId = (id: string | null) => {
    setSelectedGroupId(id);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setScope('all');
    setSelectedGroupId(null);
  };

  // Atajos: "/" enfoca el buscador, Esc cierra el inspector o cancela la creación
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = !!target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key !== 'Escape' || typing) return;
      if (groupModalOpen || groupToDelete || locToDelete || groupsDropdownOpen || pinnedPopoverOpen) return;
      if (creating) setCreating(false);
      else if (selectedId) {
        setSelectedId(null);
        setTargets([]);
        setJobs({});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [creating, selectedId, groupModalOpen, groupToDelete, locToDelete, groupsDropdownOpen, pinnedPopoverOpen]);

  /* ── Acciones (lógica conservada de la versión anterior) ───────────────── */

  // Toggle pin de custom location o de preset oficial
  const handleTogglePin = async (type: 'custom' | 'preset', id: string, pinned?: boolean) => {
    try {
      const res = await api.togglePin(type, id, pinned);
      if (type === 'custom') {
        const updated = res.location as CustomLocation;
        queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            locations: prev.locations.map((loc) => (loc.id === id ? { ...loc, is_pinned: updated.is_pinned } : loc)),
          };
        });
        toast.success(
          updated.is_pinned
            ? `"${updated.name}" fijada en accesos rápidos de FocusView`
            : `"${updated.name}" desfijada de accesos rápidos`
        );
      } else {
        const pinnedList = (res.pinned_presets || []) as string[];
        queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
          if (!prev) return prev;
          return { ...prev, pinned_presets: pinnedList };
        });
        const isNowPinned = pinnedList.includes(id.toLowerCase());
        const info = getPresetDisplay(id, locationPresets);
        toast.success(
          isNowPinned ? `Preset "${info.name}" fijado en FocusView` : `Preset "${info.name}" desfijado de FocusView`
        );
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al alternar pin: ${getErrorMessage(err)}`);
    }
  };

  // Configurar ubicación como predeterminada del sistema
  const handleSetDefaultLocation = async (type: 'custom' | 'preset', id: string, name: string) => {
    try {
      const res = await api.setDefaultLocation({ target_type: type, target_id: id });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return { ...prev, default_location: res };
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });

      setMapLat(res.latitude);
      setMapLon(res.longitude);
      setMapCity(res.city);
      if (res.timezone) setLocTimezone(res.timezone);
      if (res.altitude) setLocAltitude(res.altitude);

      toast.success(`"${name}" configurada como ubicación predeterminada general`);
    } catch (err) {
      toast.error(`Error al establecer predeterminada: ${getErrorMessage(err)}`);
    }
  };

  // Guardar nueva ubicación personalizada
  const handleSaveLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!locName.trim()) {
      toast.error('Ingresá un nombre para la ubicación personalizada');
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
        radius_km: Number(locRadiusKm) || 1.0,
        show_radius: locShowRadius,
      });

      if (locSetAsDefault) {
        await api.setDefaultLocation({ target_type: 'custom', target_id: created.id });
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
      setLocShowRadius(true);
      setLocRadiusKm(1.0);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
      setCreating(false);
      setSelectedId(created.id);
      resetTeleport();
    } catch (err) {
      toast.error(`Error al guardar: ${getErrorMessage(err)}`);
    } finally {
      setSavingLoc(false);
    }
  };

  // Actualizar radio y visibilidad de una ubicación existente
  const handleUpdateLocationRadius = async (locId: string, showRadius: boolean, radiusKm: number) => {
    try {
      const sanitizedKm = Math.max(0.05, Math.min(500, Number(radiusKm) || 1.0));
      const updated = await api.updateCustomLocation(locId, {
        show_radius: showRadius,
        radius_km: sanitizedKm,
      });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          locations: prev.locations.map((l) => (l.id === locId ? { ...l, ...updated } : l)),
        };
      });
      toast.success(
        showRadius
          ? `Radio visual fijado en ${sanitizedKm} km`
          : `Radio visual desactivado para "${updated.name}"`
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al actualizar radio: ${getErrorMessage(err)}`);
    }
  };

  const openEditLocModal = (loc: CustomLocation) => {
    setEditingLoc(loc);
    setEditName(loc.name);
    setEditCity(loc.city);
    setEditGroupId(loc.group_id || '');
    setEditTimezone(loc.timezone || DEFAULT_TZ);
    setEditAltitude(loc.altitude ?? 25);
    setEditRadiusKm(loc.radius_km ?? 1.0);
    setEditShowRadius(loc.show_radius ?? true);
    setEditModalOpen(true);
  };

  const handleSaveEditLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    if (!editName.trim()) {
      toast.error('Ingresá un nombre para la ubicación');
      return;
    }
    setSavingEditLoc(true);
    try {
      const updated = await api.updateCustomLocation(editingLoc.id, {
        name: editName.trim(),
        city: editCity.trim() || undefined,
        group_id: editGroupId || undefined,
        timezone: editTimezone,
        altitude: Number(editAltitude) || 25,
        radius_km: Math.max(0.05, Math.min(500, Number(editRadiusKm) || 1.0)),
        show_radius: editShowRadius,
      });
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          locations: prev.locations.map((l) => (l.id === editingLoc.id ? { ...l, ...updated } : l)),
        };
      });
      toast.success(`Ubicación "${updated.name}" actualizada`);
      setEditModalOpen(false);
      setEditingLoc(null);
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al editar ubicación: ${getErrorMessage(err)}`);
    } finally {
      setSavingEditLoc(false);
    }
  };

  // Eliminar ubicación (confirmado vía AlertDialog)
  const confirmDeleteLocation = async () => {
    if (!locToDelete) return;
    const { id, name } = locToDelete;
    try {
      await api.deleteCustomLocation(id);
      toast.success(`Ubicación "${name}" eliminada`);
      queryClient.setQueryData<CustomLocationsCatalog>(queryKeys.locationsCatalog, (prev) => {
        if (!prev) return prev;
        return { ...prev, locations: prev.locations.filter((l) => l.id !== id) };
      });
      if (selectedId === id) closeInspector();
      queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al eliminar ubicación: ${getErrorMessage(err)}`);
    } finally {
      setLocToDelete(null);
    }
  };

  // Teletransportar la ubicación seleccionada a N CloudPhones
  const teleport = async () => {
    if (!sel || targets.length === 0) return;
    setTeleporting(true);
    const batch = [...targets];
    setJobs(Object.fromEntries(batch.map((t) => [t, 'running' as JobState])));
    let firstError = '';

    const results = await Promise.all(
      batch.map(async (name) => {
        try {
          await api.setInstanceLocation(name, {
            custom_location_id: sel.id,
            custom_name: sel.name,
            city: sel.city,
            latitude: sel.latitude,
            longitude: sel.longitude,
            altitude: sel.altitude,
            timezone: sel.timezone,
          });
          setJobs((j) => ({ ...j, [name]: 'ok' }));
          return true;
        } catch (err) {
          if (!firstError) firstError = getErrorMessage(err);
          setJobs((j) => ({ ...j, [name]: 'fail' }));
          return false;
        }
      })
    );

    const okCount = results.filter(Boolean).length;
    const failCount = results.length - okCount;
    if (okCount === 0) {
      toast.error(`No se pudo teletransportar: ${firstError || 'error desconocido'}`);
    } else {
      (failCount ? toast.warning : toast.success)(
        `"${sel.name}": ${okCount} teléfono${okCount > 1 ? 's' : ''} teletransportado${okCount > 1 ? 's' : ''}${
          failCount ? ` · ${failCount} fallo${failCount > 1 ? 's' : ''}` : ''
        }`
      );
    }
    setTargets([]);
    setTeleporting(false);
    onRefreshInstances?.();
  };

  const copyCoords = async (lat: number, lon: number) => {
    const text = `${lat.toFixed(6)}, ${lon.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
      toast.success(`Coordenadas copiadas: ${text}`);
    } catch {
      toast.error('No se pudo acceder al portapapeles');
    }
  };

  // Guardar grupo (crear o editar)
  const handleSaveGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim()) {
      toast.error('Ingresá un nombre para el grupo');
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al guardar grupo: ${getErrorMessage(err)}`);
    } finally {
      setSavingGroup(false);
    }
  };

  // Eliminar grupo (confirmado vía AlertDialog)
  const confirmDeleteGroup = async () => {
    if (!groupToDelete) return;
    const { id: groupId, name: groupName } = groupToDelete;
    try {
      await api.deleteLocationGroup(groupId);
      toast.success(`Grupo "${groupName}" eliminado`);
      if (selectedGroupId === groupId) changeSelectedGroupId(null);
      if (locGroupId === groupId) setLocGroupId('');
      await queryClient.invalidateQueries({ queryKey: queryKeys.locationsCatalog });
    } catch (err) {
      toast.error(`Error al eliminar grupo: ${getErrorMessage(err)}`);
    } finally {
      setGroupToDelete(null);
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

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* CABECERA PRINCIPAL */}
      <header className="flex h-[55px] shrink-0 select-none items-center gap-4 border-b border-border bg-background px-4 py-2.5">
        <h1 className="flex items-center gap-2 font-mono text-base font-semibold text-foreground">
          <MapPin className="size-4 text-primary" /> Mapas y Ubicaciones
        </h1>
        <div className="ml-auto flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span className="size-1.5 rounded-full bg-success" /> {onlineCount}/{instances.length} online
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {/* SECCIÓN CENTRAL: BARRA + MAPA + FOOTER */}
        <section className="@container flex min-w-0 flex-1 flex-col border-r border-border">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            {/* Buscador */}
            <div className="relative min-w-36 flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchResults[0]) {
                    selectLocation(searchResults[0]);
                    searchInputRef.current?.blur();
                  }
                  if (e.key === 'Escape') {
                    setSearchQuery('');
                    searchInputRef.current?.blur();
                  }
                }}
                placeholder="Buscar ubicación o ciudad…"
                className="h-8 w-full rounded-md border border-input bg-surface pl-8 pr-14 text-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  title="Limpiar búsqueda"
                  className="absolute right-2 top-1/2 grid size-5 -translate-y-1/2 cursor-pointer place-items-center rounded-sm text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-sm border border-border bg-background px-1.5 font-mono text-[10px] text-muted-foreground">
                  /
                </kbd>
              )}
            </div>

            {/* Segmented control */}
            <div className="flex shrink-0 rounded-md border border-border bg-surface p-0.5 text-xs">
              {(
                [
                  ['all', `Todas (${catalog.locations.length})`, Layers],
                  ['pinned', `Fijadas (${pinnedCount})`, Pin],
                ] as const
              ).map(([k, label, Icon]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setScope(k)}
                  className={cn(
                    'inline-flex cursor-pointer items-center gap-1.5 rounded-sm px-2.5 py-1 font-mono transition-colors',
                    scope === k ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className={cn('size-3', scope === k && k === 'pinned' && 'fill-current text-primary')} />
                  {label}
                </button>
              ))}
            </div>

            {/* Popover Grupos */}
            <Popover
              open={groupsDropdownOpen}
              onOpenChange={(open) => {
                setGroupsDropdownOpen(open);
                if (open) setPinnedPopoverOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarBtnClass,
                    'max-w-[200px]',
                    selectedGroup
                      ? 'border-primary/50 bg-primary/10 text-foreground'
                      : 'border-border bg-surface text-foreground hover:bg-surface-2'
                  )}
                  title="Ver, filtrar y gestionar grupos"
                >
                  {selectedGroup ? (
                    <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selectedGroup.color || '#10b981' }} />
                  ) : (
                    <Folder className="size-3.5 shrink-0 text-primary" />
                  )}
                  <span className="truncate">{selectedGroup ? selectedGroup.name : 'Grupos'}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {selectedGroup
                      ? catalog.locations.filter((l) => l.group_id === selectedGroup.id).length
                      : catalog.groups.length}
                  </span>
                  <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', groupsDropdownOpen && 'rotate-180')} />
                </button>
              </PopoverTrigger>

              <PopoverContent align="end" sideOffset={6} className="w-80 space-y-1.5 p-2 font-mono shadow-pop">
                <div className="flex items-center justify-between border-b border-border px-1 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Layers className="size-3.5 text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      Grupos ({catalog.groups.length})
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setGroupsDropdownOpen(false);
                      openNewGroupModal();
                    }}
                    className="flex cursor-pointer items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <Plus className="size-3" /> Nuevo grupo
                  </button>
                </div>

                {catalog.groups.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar grupo…"
                      value={groupFilterQuery}
                      onChange={(e) => setGroupFilterQuery(e.target.value)}
                      className="h-7 w-full rounded-sm border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    changeSelectedGroupId(null);
                    setGroupsDropdownOpen(false);
                  }}
                  className={cn(
                    'flex w-full cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-left text-xs transition-colors',
                    selectedGroupId === null
                      ? 'bg-primary/15 font-semibold text-foreground'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                >
                  <span className="flex items-center gap-2">
                    <Layers className="size-3 text-muted-foreground" /> Todas las ubicaciones
                  </span>
                  <span className="flex items-center gap-1.5 text-[10px] opacity-70">
                    {catalog.locations.length}
                    {selectedGroupId === null && <Check className="size-3 text-primary" />}
                  </span>
                </button>

                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                  {filteredDropdownGroups.length === 0 ? (
                    <div className="py-4 text-center text-xs text-muted-foreground">
                      {catalog.groups.length === 0
                        ? 'No hay grupos creados aún.'
                        : `Ningún grupo coincide con "${groupFilterQuery}".`}
                    </div>
                  ) : (
                    filteredDropdownGroups.map((group) => {
                      const count = catalog.locations.filter((l) => l.group_id === group.id).length;
                      const isSelected = selectedGroupId === group.id;
                      return (
                        <div
                          key={group.id}
                          className={cn(
                            'group/item flex items-center justify-between rounded-sm px-2 py-1 text-xs transition-colors',
                            isSelected ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted/60'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              changeSelectedGroupId(group.id);
                              setGroupsDropdownOpen(false);
                            }}
                            className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                            title={`Filtrar por ${group.name} (${count} ubicaciones)`}
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: group.color || '#10b981' }} />
                            <span className="truncate">{group.name}</span>
                            <span className="shrink-0 text-[10px] text-muted-foreground">{count}</span>
                          </button>
                          <div className="ml-2 flex shrink-0 items-center gap-0.5 opacity-60 transition-opacity group-hover/item:opacity-100">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGroupsDropdownOpen(false);
                                openEditGroupModal(group);
                              }}
                              title={`Editar grupo "${group.name}"`}
                              className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
                            >
                              <Edit2 className="size-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setGroupsDropdownOpen(false);
                                setGroupToDelete(group);
                              }}
                              title={`Eliminar grupo "${group.name}"`}
                              className="grid size-6 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                            >
                              <Trash2 className="size-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Popover Accesos Rápidos */}
            <Popover
              open={pinnedPopoverOpen}
              onOpenChange={(open) => {
                setPinnedPopoverOpen(open);
                if (open) setGroupsDropdownOpen(false);
              }}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    toolbarBtnClass,
                    'border-border bg-surface hover:bg-surface-2',
                    combinedPinnedItems.length > 0 ? 'text-foreground' : 'text-muted-foreground'
                  )}
                  title="Accesos rápidos fijados en FocusView"
                >
                  <Pin className={cn('size-3.5', combinedPinnedItems.length > 0 ? 'fill-current text-primary' : '')} />
                  <span className="hidden @5xl:inline">Accesos rápidos</span>
                  <span className="text-[10px] text-muted-foreground">{combinedPinnedItems.length}</span>
                  <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', pinnedPopoverOpen && 'rotate-180')} />
                </button>
              </PopoverTrigger>

              <PopoverContent align="end" sideOffset={6} className="w-80 space-y-1.5 p-2 font-mono shadow-pop">
                <div className="flex items-center justify-between border-b border-border px-1 pb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Pin className="size-3.5 fill-current text-primary" />
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                      Accesos rápidos ({combinedPinnedItems.length})
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">FocusView</span>
                </div>

                {combinedPinnedItems.length > 3 && (
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Buscar acceso rápido…"
                      value={pinnedSearchQuery}
                      onChange={(e) => setPinnedSearchQuery(e.target.value)}
                      className="h-7 w-full rounded-sm border border-border bg-background pl-7 pr-2 text-xs outline-none placeholder:text-muted-foreground focus:border-primary"
                    />
                  </div>
                )}

                <div className="max-h-56 space-y-0.5 overflow-y-auto pr-0.5">
                  {filteredPinnedList.length === 0 ? (
                    <div className="px-2 py-4 text-center text-xs text-muted-foreground">
                      {combinedPinnedItems.length === 0
                        ? 'No hay accesos rápidos. Activá "Fijar en accesos rápidos" en el panel de una ubicación.'
                        : `Ningún acceso rápido coincide con "${pinnedSearchQuery}".`}
                    </div>
                  ) : (
                    filteredPinnedList.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="flex items-center justify-between rounded-sm px-2 py-1 text-xs text-foreground transition-colors hover:bg-muted/60"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const custom = item.type === 'custom' ? catalog.locations.find((l) => l.id === item.id) : undefined;
                            if (custom) {
                              selectLocation(custom);
                            } else {
                              setMapCity(item.city);
                              if (item.timezone) setLocTimezone(item.timezone);
                              if (item.altitude) setLocAltitude(item.altitude);
                              mapHandleRef.current?.flyTo(item.latitude, item.longitude);
                            }
                            toast.info(`Centrado en: ${item.name}`);
                            setPinnedPopoverOpen(false);
                          }}
                          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 text-left"
                          title={`Centrar en mapa: ${item.name} (${item.city})`}
                        >
                          {item.type === 'custom' ? (
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: item.groupColor || '#10b981' }} />
                          ) : (
                            <Globe className="size-3 shrink-0 text-primary" />
                          )}
                          <span className="min-w-0 flex-1 truncate">
                            <span className="font-medium">{item.name}</span>
                            <span className="ml-1 text-[10px] text-muted-foreground">{item.city}</span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleTogglePin(item.type, item.id, false)}
                          title={`Desfijar ${item.name} de FocusView`}
                          className="ml-1 grid size-6 shrink-0 cursor-pointer place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                <div className="border-t border-border px-1 pt-1.5 text-[10px] text-muted-foreground">
                  Aparecen como accesos directos en la barra GPS de FocusView.
                </div>
              </PopoverContent>
            </Popover>

            {/* Botón global mostrar/ocultar radios */}
            <button
              type="button"
              onClick={() => setShowAllRadii((v) => !v)}
              className={cn(
                toolbarBtnClass,
                showAllRadii
                  ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                  : 'border-border bg-surface text-muted-foreground hover:bg-surface-2 hover:text-foreground'
              )}
              title={showAllRadii ? 'Ocultar todos los radios de referencia en el mapa' : 'Mostrar radios de referencia en el mapa'}
            >
              <CircleDot className={cn('size-3.5 shrink-0', showAllRadii ? 'text-primary' : 'text-muted-foreground')} />
              <span className="hidden @4xl:inline">Radios</span>
              <span className={cn('text-[10px] font-mono', showAllRadii ? 'text-primary' : 'text-muted-foreground/70')}>
                {showAllRadii ? 'ON' : 'OFF'}
              </span>
            </button>

            {/* Botón principal */}
            <button
              type="button"
              onClick={() => startCreate()}
              className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <Plus className="size-3.5" />
              <span className="@3xl:hidden">Nueva</span>
              <span className="hidden @3xl:inline">Nueva ubicación</span>
            </button>
          </div>

          {/* MAPA HERO */}
          <div className="relative flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden">
            <Suspense
              fallback={
                <div className="flex h-full items-center justify-center gap-2 bg-surface-2 text-sm text-muted-foreground">
                  <Loader2 className="size-4 animate-spin text-primary" /> Cargando mapa…
                </div>
              }
            >
              <MapPicker
                ref={mapHandleRef}
                fill
                latitude={mapLat}
                longitude={mapLon}
                city={mapCity}
                initialZoom={12}
                showPresets={false}
                showInfoOverlay={false}
                showActiveMarker={creating}
                showCursorReadout
                showAllRadii={showAllRadii}
                activeRadiusKm={locRadiusKm}
                activeShowRadius={locShowRadius}
                markers={markers}
                selectedMarkerId={selectedId}
                onMarkerClick={handleMarkerClick}
                onChange={handleMapChange}
              >
                {/* Resultados de búsqueda flotantes */}
                {searchFocused && normalizedQuery && (
                  <div className="absolute left-3 top-3 z-[40] w-80 overflow-hidden rounded-md border border-border bg-popover shadow-pop animate-in fade-in-0 slide-in-from-top-1 duration-150">
                    <div className="flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      <span>Resultados</span>
                      <span>{visibleLocations.length}</span>
                    </div>
                    {searchResults.length === 0 ? (
                      <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                        <SearchX className="size-3.5" /> Sin coincidencias para "{searchQuery}"
                      </div>
                    ) : (
                      <ul className="max-h-64 overflow-y-auto py-1">
                        {searchResults.map((loc, i) => {
                          const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
                          return (
                            <li key={loc.id}>
                              <button
                                type="button"
                                onMouseDown={(e) => e.preventDefault()}
                                onMouseEnter={() => mapHandleRef.current?.highlight(loc.id)}
                                onMouseLeave={() => mapHandleRef.current?.highlight(null)}
                                onClick={() => {
                                  selectLocation(loc);
                                  searchInputRef.current?.blur();
                                }}
                                className={cn(
                                  'flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent',
                                  i === 0 && 'bg-surface-2'
                                )}
                              >
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grp?.color || UNGROUPED_COLOR }} />
                                <span className="min-w-0 flex-1 truncate">
                                  <span className="font-medium text-foreground">{loc.name}</span>
                                  <span className="ml-1.5 text-muted-foreground">{loc.city}</span>
                                </span>
                                {i === 0 && <kbd className="rounded-sm border border-border px-1 font-mono text-[9px] text-muted-foreground">Enter</kbd>}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}

                {/* Chips de filtros activos */}
                {!(searchFocused && normalizedQuery) && filtersActive && (
                  <div className="absolute left-3 top-3 z-[30] flex items-center gap-1.5 animate-in fade-in-0 duration-150">
                    <span className="rounded-md border border-border bg-popover/90 px-2 py-1 font-mono text-[10px] text-muted-foreground shadow-pop backdrop-blur-md">
                      {visibleLocations.length}/{catalog.locations.length} en el mapa
                    </span>
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-border bg-popover/90 px-2 py-1 font-mono text-[10px] text-foreground shadow-pop backdrop-blur-md transition-colors hover:text-primary"
                    >
                      <X className="size-3" /> Limpiar filtros
                    </button>
                  </div>
                )}

                {/* Controles flotantes */}
                <div className="absolute right-3 top-3 z-[30] flex flex-col overflow-hidden rounded-md border border-border bg-popover shadow-pop">
                  <button
                    type="button"
                    onClick={() => mapHandleRef.current?.fitToMarkers()}
                    title="Encuadrar todas las ubicaciones visibles"
                    className="grid size-[30px] cursor-pointer place-items-center text-foreground transition-colors hover:bg-accent hover:text-primary"
                  >
                    <ScanSearch className="size-3.5" />
                  </button>
                  {defaultLoc && (
                    <button
                      type="button"
                      onClick={centerOnDefault}
                      title={`Centrar en predeterminada (${defaultLoc.name})`}
                      className="grid size-[30px] cursor-pointer place-items-center border-t border-border text-warning transition-colors hover:bg-accent"
                    >
                      <Star className="size-3.5 fill-current" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowAllRadii((v) => !v)}
                    title={showAllRadii ? 'Ocultar radios de referencia' : 'Mostrar radios de referencia'}
                    className={cn(
                      'grid size-[30px] cursor-pointer place-items-center border-t border-border transition-colors',
                      showAllRadii ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                    )}
                  >
                    <CircleDot className="size-3.5" />
                  </button>
                </div>

                {/* Banner de modo creación */}
                {creating && (
                  <div className="pointer-events-none absolute inset-x-0 top-3 z-[30] flex justify-center">
                    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-primary/40 bg-popover/95 py-1 pl-3 pr-1 font-mono text-[11px] text-foreground shadow-pop backdrop-blur-md animate-in fade-in-0 slide-in-from-top-2 duration-200">
                      <span className="relative flex size-2">
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
                        <span className="relative inline-flex size-2 rounded-full bg-primary" />
                      </span>
                      Modo creación · clic o arrastrá el marcador
                      <button
                        type="button"
                        onClick={cancelCreate}
                        className="cursor-pointer rounded-full px-2 py-0.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                      >
                        Esc
                      </button>
                    </div>
                  </div>
                )}

                {/* Estado vacío del catálogo */}
                {!loading && catalog.locations.length === 0 && !creating && (
                  <div className="pointer-events-none absolute inset-0 z-[25] grid place-items-center">
                    <div className="pointer-events-auto w-72 rounded-lg border border-border bg-popover/95 p-5 text-center shadow-pop backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-200">
                      <div className="mx-auto grid size-11 place-items-center rounded-md border border-dashed border-primary/60 text-primary">
                        <MapPinPlus className="size-5" />
                      </div>
                      <p className="mt-3 text-sm font-semibold text-foreground">Todavía no hay ubicaciones</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Hacé clic en cualquier punto del mapa para fijar coordenadas y guardarlas.
                      </p>
                      <button
                        type="button"
                        onClick={() => startCreate()}
                        className="mt-4 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:opacity-90"
                      >
                        <Plus className="size-3.5" /> Crear en el centro del mapa
                      </button>
                    </div>
                  </div>
                )}

                {loading && (
                  <div className="pointer-events-none absolute inset-0 z-[25] grid place-items-center bg-background/40 backdrop-blur-[1px]">
                    <div className="flex items-center gap-2 rounded-md border border-border bg-popover px-3 py-2 text-xs text-muted-foreground shadow-pop">
                      <Loader2 className="size-3.5 animate-spin text-primary" /> Cargando ubicaciones…
                    </div>
                  </div>
                )}
              </MapPicker>
            </Suspense>
          </div>

          {/* FOOTER MÉTRICAS */}
          <footer className="flex h-9 shrink-0 select-none items-center justify-between gap-4 border-t border-border px-4 font-mono text-xs text-muted-foreground">
            <span className="truncate">
              {catalog.locations.length} ubicaciones guardadas <span className="opacity-50">•</span> {catalog.groups.length} grupos{' '}
              <span className="opacity-50">•</span> {geolocatedCount}/{instances.length} teléfonos geolocalizados
            </span>
            {defaultLoc && (
              <button
                type="button"
                onClick={centerOnDefault}
                title="Centrar el mapa en la ubicación predeterminada"
                className="inline-flex shrink-0 cursor-pointer items-center gap-1.5 rounded-sm px-1.5 py-0.5 transition-colors hover:bg-muted hover:text-foreground"
              >
                <Star className="size-3 fill-current text-warning" />
                <span className="max-w-40 truncate">{defaultLoc.name}</span>
              </button>
            )}
          </footer>
        </section>

        {/* ASIDE INSPECTOR */}
        <aside className="flex w-[380px] shrink-0 select-none flex-col overflow-hidden bg-surface">
          {creating ? (
            /* ── MODO CREACIÓN ── */
            <form
              key="create"
              onSubmit={handleSaveLocation}
              className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200"
            >
              <div className="border-b border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="grid size-12 shrink-0 place-items-center rounded-md border border-dashed border-primary/60 bg-primary/10 text-primary">
                    <MapPinPlus className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold">Nueva ubicación</h2>
                    <p className="text-xs text-muted-foreground">Clic en el mapa o arrastrá el marcador para ajustar.</p>
                  </div>
                  <button
                    type="button"
                    onClick={cancelCreate}
                    title="Cancelar (Esc)"
                    className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-2 rounded-md border border-border bg-card px-2.5 py-1.5 font-mono text-[11px]">
                  <Crosshair className="size-3.5 shrink-0 text-primary" />
                  <span className="flex-1 tabular-nums text-foreground">
                    {mapLat.toFixed(6)}, {mapLon.toFixed(6)}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" /> en vivo
                  </span>
                </div>
              </div>

              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                <div>
                  <label className={fieldLabelClass} htmlFor="loc-name">
                    Nombre personalizado *
                  </label>
                  <input
                    id="loc-name"
                    type="text"
                    required
                    autoFocus
                    placeholder="Ej: Oficina Palermo, Depósito Norte…"
                    value={locName}
                    onChange={(e) => setLocName(e.target.value)}
                    className={cn(fieldClass, 'font-medium')}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className={fieldLabelClass}>Grupo</span>
                    <Popover open={formGroupSelectOpen} onOpenChange={setFormGroupSelectOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(fieldClass, 'flex cursor-pointer items-center justify-between gap-1.5 hover:bg-muted/40')}
                        >
                          <span className="flex min-w-0 items-center gap-1.5">
                            {selectedFormGroup ? (
                              <>
                                <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: selectedFormGroup.color || '#10b981' }} />
                                <span className="truncate font-medium">{selectedFormGroup.name}</span>
                              </>
                            ) : (
                              <span className="font-mono text-[11px] text-muted-foreground">Sin grupo</span>
                            )}
                          </span>
                          <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', formGroupSelectOpen && 'rotate-180')} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" sideOffset={4} className="w-56 space-y-0.5 p-1 font-mono">
                        <button
                          type="button"
                          onClick={() => {
                            setLocGroupId('');
                            setFormGroupSelectOpen(false);
                          }}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                            locGroupId === '' ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                          )}
                        >
                          Sin grupo
                        </button>
                        <div className="max-h-48 space-y-0.5 overflow-y-auto">
                          {catalog.groups.map((g) => (
                            <button
                              key={g.id}
                              type="button"
                              onClick={() => {
                                setLocGroupId(g.id);
                                setFormGroupSelectOpen(false);
                              }}
                              className={cn(
                                'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                                locGroupId === g.id ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted'
                              )}
                            >
                              <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color || '#10b981' }} />
                              <span className="flex-1 truncate">{g.name}</span>
                              {locGroupId === g.id && <Check className="size-3 text-primary" />}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setFormGroupSelectOpen(false);
                            openNewGroupModal();
                          }}
                          className="flex w-full cursor-pointer items-center gap-1.5 rounded-sm border-t border-border px-2 py-1.5 text-left text-[11px] text-primary hover:bg-muted"
                        >
                          <Plus className="size-3" /> Nuevo grupo
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                  <div>
                    <label className={fieldLabelClass} htmlFor="loc-city">
                      Ciudad / referencia
                    </label>
                    <input id="loc-city" type="text" value={mapCity} onChange={(e) => setMapCity(e.target.value)} className={fieldClass} />
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_96px] gap-2">
                  <div>
                    <label className={fieldLabelClass} htmlFor="loc-tz">
                      Zona horaria <span className="normal-case tracking-normal opacity-70">({formatUtcOffset(locTimezone)})</span>
                    </label>
                    <input
                      id="loc-tz"
                      type="text"
                      value={locTimezone}
                      onChange={(e) => setLocTimezone(e.target.value)}
                      className={cn(fieldClass, 'font-mono text-[11px]')}
                    />
                  </div>
                  <div>
                    <label className={fieldLabelClass} htmlFor="loc-alt">
                      Altitud (m)
                    </label>
                    <input
                      id="loc-alt"
                      type="number"
                      value={locAltitude}
                      onChange={(e) => setLocAltitude(Number(e.target.value))}
                      className={cn(fieldClass, 'font-mono text-[11px] tabular-nums')}
                    />
                  </div>
                </div>

                <div className="space-y-2 pt-1">
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                    <Star className={cn('size-4 shrink-0', locSetAsDefault ? 'fill-current text-warning' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Ubicación predeterminada</div>
                      <div className="text-xs text-muted-foreground">Base para CloudPhones nuevos y vistas de mapa</div>
                    </div>
                    <Switch checked={locSetAsDefault} onCheckedChange={setLocSetAsDefault} className="data-[state=checked]:bg-success" />
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                    <Pin className={cn('size-4 shrink-0', locIsPinned ? 'fill-current text-primary' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Fijar en accesos rápidos</div>
                      <div className="text-xs text-muted-foreground">Aparece en la barra GPS de FocusView</div>
                    </div>
                    <Switch checked={locIsPinned} onCheckedChange={setLocIsPinned} />
                  </label>

                  <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      <CircleDot className={cn('size-4 shrink-0', locShowRadius ? 'text-primary' : 'text-muted-foreground')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Radio de referencia</div>
                        <div className="text-xs text-muted-foreground">
                          {locShowRadius
                            ? `Círculo visual de cobertura en el mapa (${locRadiusKm} km)`
                            : 'Círculo visual desactivado'}
                        </div>
                      </div>
                      <Switch checked={locShowRadius} onCheckedChange={setLocShowRadius} />
                    </div>

                    {locShowRadius && (
                      <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                        <div className="flex items-center justify-between">
                          <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="loc-radius-input">
                            Alcance del radio
                          </label>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {locRadiusKm} km
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            id="loc-radius-input"
                            type="number"
                            min={0.1}
                            max={500}
                            step={0.1}
                            value={locRadiusKm}
                            onChange={(e) => setLocRadiusKm(Math.max(0.1, Number(e.target.value) || 1.0))}
                            className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                          />
                          <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                            <button
                              key={presetKm}
                              type="button"
                              onClick={() => setLocRadiusKm(presetKm)}
                              className={cn(
                                'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                                locRadiusKm === presetKm
                                  ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                                  : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                              )}
                            >
                              {presetKm} km
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="border-t border-border p-4">
                <button
                  type="submit"
                  disabled={savingLoc || !locName.trim()}
                  className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {savingLoc ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                  {savingLoc ? 'Guardando…' : 'Guardar ubicación'}
                </button>
                <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">POST /locations/custom</p>
              </div>
            </form>
          ) : sel ? (
            /* ── MODO INSPECTOR ── */
            <div key={sel.id} className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 slide-in-from-right-2 duration-200">
              <div className="border-b border-border p-4">
                <div className="flex items-start gap-3">
                  <div
                    className="grid size-12 shrink-0 place-items-center rounded-md border bg-card"
                    style={{ borderColor: selColor, color: selColor }}
                  >
                    {selIsDefault ? <Star className="size-5 fill-current text-warning" /> : <MapPin className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-base font-semibold" title={sel.name}>
                      {sel.name}
                    </h2>
                    <p className="truncate text-xs text-muted-foreground" title={sel.city}>
                      {sel.city}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-xs">
                      <span className="size-1.5 shrink-0 rounded-full" style={{ backgroundColor: selColor }} />
                      {selGroup ? selGroup.name : <span className="text-muted-foreground">Sin grupo</span>}
                    </p>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <button
                      type="button"
                      onClick={() => openEditLocModal(sel)}
                      title="Editar ubicación completa"
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <Edit2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setLocToDelete(sel)}
                      title="Eliminar ubicación"
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={closeInspector}
                      title="Cerrar (Esc)"
                      className="grid size-8 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-border bg-border text-xs">
                  {[
                    ['Altitud', `${sel.altitude ?? 25} m`, undefined],
                    ['Precisión', sel.accuracy != null ? `±${sel.accuracy} m` : 'auto', undefined],
                    ['Zona', formatUtcOffset(sel.timezone), sel.timezone || 'UTC'],
                  ].map(([k, v, title]) => (
                    <div key={k} className="bg-card px-2.5 py-2" title={title}>
                      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</dt>
                      <dd className="mt-0.5 truncate font-mono tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-2 flex items-center gap-2 rounded-md border border-border bg-card py-1 pl-2.5 pr-1 font-mono text-[11px]">
                  <Crosshair className="size-3.5 shrink-0 text-primary" />
                  <span className="flex-1 truncate tabular-nums">
                    {sel.latitude.toFixed(6)}, {sel.longitude.toFixed(6)}
                  </span>
                  <button
                    type="button"
                    onClick={() => copyCoords(sel.latitude, sel.longitude)}
                    className={cn(
                      'inline-flex h-6 cursor-pointer items-center gap-1 rounded-sm px-1.5 transition-colors',
                      copied ? 'text-success' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    )}
                  >
                    {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                </div>

                <div className="mt-3 space-y-2">
                  <label
                    className={cn(
                      'flex items-center gap-3 rounded-md border border-border bg-card p-2.5',
                      selIsDefault ? 'cursor-default' : 'cursor-pointer transition-colors hover:border-muted-foreground/40'
                    )}
                    title={selIsDefault ? 'Ya es la predeterminada. Elegí otra ubicación para reemplazarla.' : undefined}
                  >
                    <Star className={cn('size-4 shrink-0', selIsDefault ? 'fill-current text-warning' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Ubicación predeterminada</div>
                      <div className="text-xs text-muted-foreground">
                        {selIsDefault ? 'Activa: base para CloudPhones nuevos' : 'Base para CloudPhones nuevos y vistas de mapa'}
                      </div>
                    </div>
                    <Switch
                      checked={selIsDefault}
                      disabled={selIsDefault}
                      onCheckedChange={() => handleSetDefaultLocation('custom', sel.id, sel.name)}
                      className="data-[state=checked]:bg-success disabled:opacity-100"
                    />
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-md border border-border bg-card p-2.5 transition-colors hover:border-muted-foreground/40">
                    <Pin className={cn('size-4 shrink-0', sel.is_pinned ? 'fill-current text-primary' : 'text-muted-foreground')} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">Fijar en accesos rápidos</div>
                      <div className="text-xs text-muted-foreground">Aparece en la barra GPS de FocusView</div>
                    </div>
                    <Switch checked={!!sel.is_pinned} onCheckedChange={(v) => handleTogglePin('custom', sel.id, v)} />
                  </label>

                  <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
                    <div className="flex items-center gap-3">
                      <CircleDot className={cn('size-4 shrink-0', (sel.show_radius ?? true) ? 'text-primary' : 'text-muted-foreground')} />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">Radio de referencia</div>
                        <div className="text-xs text-muted-foreground">
                          {(sel.show_radius ?? true)
                            ? `Zona de influencia visual (${sel.radius_km ?? 1} km) activa en mapa`
                            : 'Zona de influencia visual desactivada'}
                        </div>
                      </div>
                      <Switch
                        checked={sel.show_radius ?? true}
                        onCheckedChange={(val) =>
                          handleUpdateLocationRadius(sel.id, val, sel.radius_km ?? 1.0)
                        }
                      />
                    </div>

                    {(sel.show_radius ?? true) && (
                      <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                            Alcance del radio
                          </span>
                          <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                            {sel.radius_km ?? 1} km
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={0.1}
                            max={500}
                            step={0.1}
                            defaultValue={sel.radius_km ?? 1}
                            key={`${sel.id}-${sel.radius_km}`}
                            onBlur={(e) => {
                              const val = Math.max(0.1, Number(e.target.value) || 1.0);
                              if (val !== (sel.radius_km ?? 1)) {
                                handleUpdateLocationRadius(sel.id, sel.show_radius ?? true, val);
                              }
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                const val = Math.max(0.1, Number((e.target as HTMLInputElement).value) || 1.0);
                                handleUpdateLocationRadius(sel.id, sel.show_radius ?? true, val);
                              }
                            }}
                            className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                          />
                          <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                            <button
                              key={presetKm}
                              type="button"
                              onClick={() =>
                                handleUpdateLocationRadius(sel.id, sel.show_radius ?? true, presetKm)
                              }
                              className={cn(
                                'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                                (sel.radius_km ?? 1) === presetKm
                                  ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                                  : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                              )}
                            >
                              {presetKm} km
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* TELETRANSPORTAR A */}
              <div className="flex min-h-0 flex-1 flex-col p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={sectionTitleClass}>
                    Teletransportar a <span className="normal-case tracking-normal">· {selPhones.length} aquí</span>
                  </h3>
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className="cursor-pointer text-primary hover:underline disabled:opacity-40"
                      disabled={teleporting}
                      onClick={() =>
                        setTargets(instances.filter((p) => !isPhoneAtLocation(p, sel)).map((p) => p.instance_name))
                      }
                    >
                      Faltantes
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-primary hover:underline disabled:opacity-40"
                      disabled={teleporting}
                      onClick={() => setTargets(instances.map((p) => p.instance_name))}
                    >
                      Todas
                    </button>
                    <button
                      type="button"
                      className="cursor-pointer text-muted-foreground hover:text-foreground disabled:opacity-40"
                      disabled={teleporting}
                      onClick={resetTeleport}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                {instances.length === 0 ? (
                  <div className="grid flex-1 place-items-center rounded-md border border-dashed border-border text-center text-xs text-muted-foreground">
                    <div>
                      <Smartphone className="mx-auto mb-2 size-6 opacity-40" />
                      No hay CloudPhones creados.
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-0 grid-cols-2 content-start gap-1.5 overflow-auto">
                    {instances.map((p) => {
                      const on = targets.includes(p.instance_name);
                      const here = isPhoneAtLocation(p, sel);
                      const job = jobs[p.instance_name];
                      const currentLabel = p.location?.custom_name || p.location?.city;
                      return (
                        <button
                          key={p.instance_name}
                          type="button"
                          disabled={teleporting}
                          onClick={() =>
                            setTargets((t) => (on ? t.filter((x) => x !== p.instance_name) : [...t, p.instance_name]))
                          }
                          title={currentLabel ? `Ubicación actual: ${currentLabel}` : 'Sin ubicación GPS asignada'}
                          className={cn(
                            'flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-left text-xs transition-all disabled:cursor-wait',
                            !p.running && !on && 'opacity-60',
                            on ? 'glow-primary border-primary bg-primary/10 font-medium' : 'border-border bg-card hover:border-muted-foreground/40'
                          )}
                        >
                          <Smartphone className="size-3.5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-mono">{p.instance_name}</div>
                            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <span className={cn('size-1.5 shrink-0 rounded-full', p.running ? 'bg-success' : 'bg-muted-foreground')} />
                              {job === 'running' ? (
                                'aplicando…'
                              ) : job === 'ok' ? (
                                <span className="font-medium text-success">teletransportado</span>
                              ) : job === 'fail' ? (
                                <span className="text-destructive">falló</span>
                              ) : here ? (
                                <span className="rounded-sm bg-success/15 px-1 font-mono font-medium text-success">ya asignada</span>
                              ) : !p.location ? (
                                <span className="rounded-sm bg-warning/15 px-1 font-mono font-medium text-warning">sin gps</span>
                              ) : (
                                <span className="truncate">{currentLabel}</span>
                              )}
                            </div>
                          </div>
                          {job === 'running' ? (
                            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
                          ) : job === 'ok' ? (
                            <Check className="size-3.5 shrink-0 text-success" />
                          ) : job === 'fail' ? (
                            <X className="size-3.5 shrink-0 text-destructive" />
                          ) : on ? (
                            <span className="grid size-3.5 shrink-0 place-items-center rounded-sm bg-primary text-primary-foreground">
                              <Check className="size-2.5" strokeWidth={3} />
                            </span>
                          ) : (
                            <span className="size-3.5 shrink-0 rounded-sm border border-border" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    onClick={teleport}
                    disabled={!targets.length || teleporting}
                    className="flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {teleporting ? <Loader2 className="size-4 animate-spin" /> : <Navigation className="size-4" />}
                    {teleporting
                      ? 'Teletransportando…'
                      : targets.length
                      ? `Teletransportar a ${targets.length} teléfono${targets.length > 1 ? 's' : ''}`
                      : 'Elegí teléfonos destino'}
                  </button>
                  <p className="mt-2 text-center font-mono text-[11px] text-muted-foreground">
                    GPS · zona horaria · altitud se aplican en caliente
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* ── VISTA GENERAL (sin selección) ── */
            <div key="overview" className="flex min-h-0 flex-1 flex-col animate-in fade-in-0 duration-200">
              <div className="border-b border-border p-4">
                <h3 className={sectionTitleClass}>Predeterminada del sistema</h3>
                {defaultLoc ? (
                  <div className="mt-2 flex items-center gap-3 rounded-md border border-border bg-card p-2.5">
                    <div className="grid size-9 shrink-0 place-items-center rounded-md bg-warning/15 text-warning">
                      <Star className="size-4 fill-current" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{defaultLoc.name}</div>
                      <div className="truncate font-mono text-[11px] text-muted-foreground">
                        {defaultLoc.latitude.toFixed(4)}, {defaultLoc.longitude.toFixed(4)} · {formatUtcOffset(defaultLoc.timezone)}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={centerOnDefault}
                      title="Centrar en el mapa"
                      className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-md border border-border text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                    >
                      <LocateFixed className="size-4" />
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
                    Sin predeterminada. Activala desde el panel de cualquier ubicación.
                  </div>
                )}
              </div>

              <div className="flex min-h-0 flex-1 flex-col px-4 pt-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className={sectionTitleClass}>Ubicaciones</h3>
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {visibleLocations.length}/{catalog.locations.length}
                  </span>
                </div>

                {loading ? (
                  <div className="space-y-1.5">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="h-11 animate-pulse rounded-md bg-card" />
                    ))}
                  </div>
                ) : catalog.locations.length === 0 ? (
                  <div className="grid flex-1 place-items-center pb-4 text-center">
                    <div>
                      <MapPin className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                      <p className="text-sm font-medium">Sin ubicaciones guardadas</p>
                      <p className="mt-1 text-xs text-muted-foreground">Hacé clic en el mapa para crear la primera.</p>
                    </div>
                  </div>
                ) : visibleLocations.length === 0 ? (
                  <div className="grid flex-1 place-items-center pb-4 text-center">
                    <div>
                      <SearchX className="mx-auto mb-2 size-7 text-muted-foreground/40" />
                      <p className="text-sm font-medium">Ninguna ubicación coincide</p>
                      <button type="button" onClick={clearFilters} className="mt-2 cursor-pointer text-xs text-primary hover:underline">
                        Limpiar filtros
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="-mx-1 min-h-0 flex-1 space-y-0.5 overflow-y-auto px-1 pb-2">
                    {visibleLocations.map((loc) => {
                      const grp = loc.group_id ? groupsMap.get(loc.group_id) : undefined;
                      const phones = phonesByLocation.get(loc.id) ?? [];
                      const online = phones.filter((p) => p.running).length;
                      const isDefault = defaultLoc?.id === loc.id;
                      return (
                        <li key={loc.id}>
                          <button
                            type="button"
                            onClick={() => selectLocation(loc)}
                            onMouseEnter={() => mapHandleRef.current?.highlight(loc.id)}
                            onMouseLeave={() => mapHandleRef.current?.highlight(null)}
                            className="group flex w-full cursor-pointer items-center gap-2.5 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors hover:border-border hover:bg-card"
                          >
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: grp?.color || UNGROUPED_COLOR }} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 text-sm font-medium">
                                <span className="truncate">{loc.name}</span>
                                {isDefault && <Star className="size-3 shrink-0 fill-current text-warning" />}
                                {loc.is_pinned && <Pin className="size-3 shrink-0 fill-current text-primary" />}
                              </div>
                              <div className="truncate text-xs text-muted-foreground">
                                {loc.city}
                                {grp ? ` · ${grp.name}` : ''}
                              </div>
                            </div>
                            <span
                              className={cn(
                                'inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5 font-mono text-[10px] tabular-nums',
                                phones.length === 0
                                  ? 'text-muted-foreground/60'
                                  : online > 0
                                  ? 'bg-success/15 text-success'
                                  : 'bg-muted text-muted-foreground'
                              )}
                              title={`${online}/${phones.length} teléfonos online`}
                            >
                              <Smartphone className="size-3" /> {phones.length}
                            </span>
                            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="flex items-center gap-2 border-t border-border px-4 py-2.5 text-[11px] text-muted-foreground">
                <MousePointerClick className="size-3.5 shrink-0 text-primary" />
                <span className="flex-1">Clic en el mapa para crear una ubicación</span>
                <kbd className="rounded-sm border border-border bg-background px-1.5 font-mono text-[10px]">/</kbd>
                <span>buscar</span>
              </div>
            </div>
          )}
        </aside>
      </div>

      {/* DIÁLOGO CREAR / EDITAR GRUPO */}
      <Dialog
        open={groupModalOpen}
        onOpenChange={(o) => {
          setGroupModalOpen(o);
          if (!o) setEditingGroup(null);
        }}
      >
        <DialogContent className="max-w-sm gap-0 p-0">
          <DialogHeader className="border-b border-border p-4 pr-10">
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <Folder className="size-4 text-primary" />
              {editingGroup ? 'Editar grupo' : 'Nuevo grupo de geolocalizaciones'}
            </DialogTitle>
            <DialogDescription className="text-xs">
              Los grupos colorean los pines del mapa y permiten filtrar el catálogo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveGroup} className="space-y-3 p-4">
            <div>
              <label className={fieldLabelClass} htmlFor="group-name">
                Nombre del grupo *
              </label>
              <input
                id="group-name"
                type="text"
                required
                autoFocus
                placeholder="Ej: Sedes LATAM, Zonas bancarias…"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div>
              <span className={fieldLabelClass}>Color distintivo</span>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE_COLORS.map((col) => (
                  <button
                    type="button"
                    key={col}
                    onClick={() => setGroupColorInput(col)}
                    aria-label={`Color ${col}`}
                    className={cn(
                      'grid size-6 cursor-pointer place-items-center rounded-full border-2 transition-transform hover:scale-110',
                      groupColorInput === col ? 'scale-110 border-foreground' : 'border-transparent'
                    )}
                    style={{ backgroundColor: col }}
                  >
                    {groupColorInput === col && <Check className="size-3 text-background" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={fieldLabelClass} htmlFor="group-desc">
                Descripción (opcional)
              </label>
              <input
                id="group-desc"
                type="text"
                placeholder="Objetivo o referencia del grupo…"
                value={groupDescInput}
                onChange={(e) => setGroupDescInput(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setGroupModalOpen(false)}
                className="h-8 cursor-pointer rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingGroup || !groupNameInput.trim()}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingGroup && <Loader2 className="size-3.5 animate-spin" />}
                {editingGroup ? 'Guardar cambios' : 'Crear grupo'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* CONFIRMAR ELIMINACIÓN DE UBICACIÓN */}
      <AlertDialog open={!!locToDelete} onOpenChange={(o) => !o && setLocToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar "{locToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Se borra del catálogo y de los accesos rápidos. Los CloudPhones que ya la tienen asignada conservan sus
              coordenadas actuales.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteLocation}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* DIÁLOGO EDITAR UBICACIÓN */}
      <Dialog
        open={editModalOpen}
        onOpenChange={(o) => {
          setEditModalOpen(o);
          if (!o) setEditingLoc(null);
        }}
      >
        <DialogContent className="max-w-md gap-0 p-0">
          <DialogHeader className="border-b border-border p-4 pr-10">
            <DialogTitle className="flex items-center gap-2 font-mono text-sm">
              <Edit2 className="size-4 text-primary" />
              Editar ubicación
            </DialogTitle>
            <DialogDescription className="text-xs">
              Modificá el nombre, grupo, ciudad o el radio de influencia visual en el mapa.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveEditLocation} className="space-y-3 p-4">
            <div>
              <label className={fieldLabelClass} htmlFor="edit-name">
                Nombre de la ubicación *
              </label>
              <input
                id="edit-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className={fieldClass}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className={fieldLabelClass}>Grupo</span>
                <Popover open={editGroupSelectOpen} onOpenChange={setEditGroupSelectOpen}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className={cn(fieldClass, 'flex cursor-pointer items-center justify-between gap-1.5 hover:bg-muted/40')}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        {editGroupId ? (
                          <>
                            <span
                              className="size-2 shrink-0 rounded-full"
                              style={{ backgroundColor: groupsMap.get(editGroupId)?.color || '#10b981' }}
                            />
                            <span className="truncate font-medium">{groupsMap.get(editGroupId)?.name}</span>
                          </>
                        ) : (
                          <span className="font-mono text-[11px] text-muted-foreground">Sin grupo</span>
                        )}
                      </span>
                      <ChevronDown className={cn('size-3 shrink-0 opacity-60 transition-transform', editGroupSelectOpen && 'rotate-180')} />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" sideOffset={4} className="w-56 space-y-0.5 p-1 font-mono">
                    <button
                      type="button"
                      onClick={() => {
                        setEditGroupId('');
                        setEditGroupSelectOpen(false);
                      }}
                      className={cn(
                        'flex w-full cursor-pointer items-center gap-1.5 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                        editGroupId === '' ? 'bg-primary/15 font-semibold text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      Sin grupo
                    </button>
                    <div className="max-h-48 space-y-0.5 overflow-y-auto">
                      {catalog.groups.map((g) => (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => {
                            setEditGroupId(g.id);
                            setEditGroupSelectOpen(false);
                          }}
                          className={cn(
                            'flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-left text-xs transition-colors',
                            editGroupId === g.id ? 'bg-primary/15 font-semibold text-foreground' : 'text-foreground hover:bg-muted'
                          )}
                        >
                          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: g.color || '#10b981' }} />
                          <span className="flex-1 truncate">{g.name}</span>
                          {editGroupId === g.id && <Check className="size-3 text-primary" />}
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <label className={fieldLabelClass} htmlFor="edit-city">
                  Ciudad / referencia
                </label>
                <input
                  id="edit-city"
                  type="text"
                  value={editCity}
                  onChange={(e) => setEditCity(e.target.value)}
                  className={fieldClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-[1fr_96px] gap-2">
              <div>
                <label className={fieldLabelClass} htmlFor="edit-tz">
                  Zona horaria
                </label>
                <input
                  id="edit-tz"
                  type="text"
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className={cn(fieldClass, 'font-mono text-[11px]')}
                />
              </div>
              <div>
                <label className={fieldLabelClass} htmlFor="edit-alt">
                  Altitud (m)
                </label>
                <input
                  id="edit-alt"
                  type="number"
                  value={editAltitude}
                  onChange={(e) => setEditAltitude(Number(e.target.value))}
                  className={cn(fieldClass, 'font-mono text-[11px] tabular-nums')}
                />
              </div>
            </div>

            <div className="rounded-md border border-border bg-card p-2.5 space-y-2">
              <div className="flex items-center gap-3">
                <CircleDot className={cn('size-4 shrink-0', editShowRadius ? 'text-primary' : 'text-muted-foreground')} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">Radio de referencia</div>
                  <div className="text-xs text-muted-foreground">
                    {editShowRadius ? `Visible en el mapa (${editRadiusKm} km)` : 'Oculto en el mapa'}
                  </div>
                </div>
                <Switch checked={editShowRadius} onCheckedChange={setEditShowRadius} />
              </div>

              {editShowRadius && (
                <div className="pt-2 border-t border-border/60 space-y-2 animate-in fade-in-0 duration-150">
                  <div className="flex items-center justify-between">
                    <label className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground" htmlFor="edit-radius-input">
                      Alcance del radio (km)
                    </label>
                    <span className="font-mono text-xs font-semibold tabular-nums text-foreground">
                      {editRadiusKm} km
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit-radius-input"
                      type="number"
                      min={0.1}
                      max={500}
                      step={0.1}
                      value={editRadiusKm}
                      onChange={(e) => setEditRadiusKm(Math.max(0.1, Number(e.target.value) || 1.0))}
                      className={cn(fieldClass, 'font-mono text-xs tabular-nums')}
                    />
                    <span className="font-mono text-xs text-muted-foreground shrink-0">km</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {[0.5, 1, 2, 5, 10, 25].map((presetKm) => (
                      <button
                        key={presetKm}
                        type="button"
                        onClick={() => setEditRadiusKm(presetKm)}
                        className={cn(
                          'rounded border px-2 py-0.5 font-mono text-[10px] transition-colors cursor-pointer',
                          editRadiusKm === presetKm
                            ? 'border-primary/50 bg-primary/20 text-primary font-semibold'
                            : 'border-border bg-background text-muted-foreground hover:bg-surface-2 hover:text-foreground'
                        )}
                      >
                        {presetKm} km
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditModalOpen(false)}
                className="h-8 cursor-pointer rounded-md border border-border px-3 text-xs font-medium text-foreground hover:bg-accent"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={savingEditLoc || !editName.trim()}
                className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {savingEditLoc && <Loader2 className="size-3.5 animate-spin" />}
                Guardar cambios
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {/* CONFIRMAR ELIMINACIÓN DE GRUPO */}
      <AlertDialog open={!!groupToDelete} onOpenChange={(o) => !o && setGroupToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el grupo "{groupToDelete?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              Las ubicaciones dentro de este grupo no se borran: quedan sin grupo asignado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmDeleteGroup}>
              Eliminar grupo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
