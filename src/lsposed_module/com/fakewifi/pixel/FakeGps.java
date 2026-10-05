package com.fakewifi.pixel;

import android.location.Criteria;
import android.location.Location;
import android.location.LocationListener;
import android.location.LocationManager;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileReader;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public class FakeGps {

    private static final String GPS_FILE = "/data/local/tmp/fake_gps.conf";

    // Default: Buenos Aires (Obelisco)
    private static double sLat = -34.603722;
    private static double sLon = -58.381592;
    private static double sAlt = 25.0;
    private static float sAcc = 4.2f;

    private static long sLastFileCheck = 0;
    private static long sLastFileModified = 0;

    private static final ScheduledExecutorService sScheduler = Executors.newScheduledThreadPool(2);
    private static final Map<LocationListener, ScheduledFuture<?>> sActiveUpdates = new ConcurrentHashMap<>();
    private static Handler sMainHandler;

    private static Handler getMainHandler() {
        if (sMainHandler == null) {
            try {
                sMainHandler = new Handler(Looper.getMainLooper());
            } catch (Throwable ignored) {}
        }
        return sMainHandler;
    }

    private static synchronized void reloadConfigIfNeeded() {
        long now = System.currentTimeMillis();
        if (now - sLastFileCheck < 1500) return;
        sLastFileCheck = now;

        File f = new File(GPS_FILE);
        if (!f.exists() || !f.canRead()) return;

        long mod = f.lastModified();
        if (mod == sLastFileModified) return;
        sLastFileModified = mod;

        try (BufferedReader br = new BufferedReader(new FileReader(f))) {
            String line;
            while ((line = br.readLine()) != null) {
                line = line.trim();
                if (line.isEmpty() || line.startsWith("#")) continue;

                if (line.contains("=") || line.contains(":")) {
                    String[] parts = line.split("[=:]", 2);
                    if (parts.length == 2) {
                        String key = parts[0].trim().toLowerCase();
                        String val = parts[1].trim();
                        try {
                            if (key.equals("lat") || key.equals("latitude")) {
                                sLat = Double.parseDouble(val);
                            } else if (key.equals("lon") || key.equals("lng") || key.equals("longitude")) {
                                sLon = Double.parseDouble(val);
                            } else if (key.equals("alt") || key.equals("altitude")) {
                                sAlt = Double.parseDouble(val);
                            } else if (key.equals("acc") || key.equals("accuracy")) {
                                sAcc = Float.parseFloat(val);
                            }
                        } catch (Throwable ignored) {}
                    }
                } else if (line.contains(",")) {
                    String[] parts = line.split(",");
                    if (parts.length >= 2) {
                        try {
                            sLat = Double.parseDouble(parts[0].trim());
                            sLon = Double.parseDouble(parts[1].trim());
                            if (parts.length >= 3) {
                                sAlt = Double.parseDouble(parts[2].trim());
                            }
                        } catch (Throwable ignored) {}
                    }
                }
            }
        } catch (Throwable t) {
            XposedBridge.log("FakeGps: Error reading " + GPS_FILE + ": " + t);
        }
    }

    public static Location createLocation(String provider) {
        reloadConfigIfNeeded();
        if (provider == null || provider.isEmpty()) {
            provider = LocationManager.GPS_PROVIDER;
        }

        Location loc = new Location(provider);

        // Micro-jitter browniano natural (~0.5 - 1.2 m) para que no parezca una antena congelada
        double t = SystemClock.elapsedRealtime() / 1000.0;
        double jitterLat = (Math.sin(t * 1.7) * 0.000006) + ((Math.random() - 0.5) * 0.000003);
        double jitterLon = (Math.cos(t * 1.3) * 0.000006) + ((Math.random() - 0.5) * 0.000003);

        loc.setLatitude(sLat + jitterLat);
        loc.setLongitude(sLon + jitterLon);
        loc.setAltitude(sAlt + (Math.sin(t * 0.8) * 0.25));
        loc.setTime(System.currentTimeMillis());
        loc.setElapsedRealtimeNanos(SystemClock.elapsedRealtimeNanos());
        loc.setAccuracy(sAcc + (float) (Math.random() * 0.5));
        loc.setSpeed(0.0f);
        loc.setBearing(0.0f);

        // Extras con número de satélites GNSS realistas (14 a 18 satélites)
        Bundle extras = new Bundle();
        int sats = 14 + (int) (Math.random() * 5);
        extras.putInt("satellites", sats);
        extras.putInt("maxSatellites", 24);
        loc.setExtras(extras);

        // Neutralizar marcas de mock nativas en el objeto Location
        try {
            Method m = Location.class.getMethod("setIsFromMockProvider", boolean.class);
            m.setAccessible(true);
            m.invoke(loc, false);
        } catch (Throwable ignored) {}

        try {
            Method m2 = Location.class.getMethod("setMock", boolean.class);
            m2.setAccessible(true);
            m2.invoke(loc, false);
        } catch (Throwable ignored) {}

        return loc;
    }

    public static void startLocationUpdates(final LocationListener listener, final String provider, long minTimeMs, final Handler targetHandler) {
        if (listener == null) return;
        stopLocationUpdates(listener);

        long periodMs = Math.max(1000L, Math.min(minTimeMs, 3000L));

        ScheduledFuture<?> future = sScheduler.scheduleWithFixedDelay(new Runnable() {
            @Override
            public void run() {
                try {
                    final Location loc = createLocation(provider);
                    Runnable dispatch = new Runnable() {
                        @Override
                        public void run() {
                            try {
                                listener.onLocationChanged(loc);
                            } catch (Throwable t) {
                                XposedBridge.log("FakeGps: Error dispatching onLocationChanged: " + t);
                            }
                        }
                    };

                    if (targetHandler != null) {
                        targetHandler.post(dispatch);
                    } else {
                        Handler h = getMainHandler();
                        if (h != null) h.post(dispatch);
                        else dispatch.run();
                    }
                } catch (Throwable t) {
                    XposedBridge.log("FakeGps: Update error: " + t);
                }
            }
        }, 100, periodMs, TimeUnit.MILLISECONDS);

        sActiveUpdates.put(listener, future);
    }

    public static void stopLocationUpdates(LocationListener listener) {
        if (listener == null) return;
        ScheduledFuture<?> f = sActiveUpdates.remove(listener);
        if (f != null) {
            f.cancel(true);
        }
    }

    public static void hook(XC_LoadPackage.LoadPackageParam lpparam) {
        try {
            Class<?> locClass = Location.class;

            // 1. Hook Location.isFromMockProvider & isMock (Anti-detección estricta)
            XposedHelpers.findAndHookMethod(locClass, "isFromMockProvider", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(false);
                }
            });

            try {
                XposedHelpers.findAndHookMethod(locClass, "isMock", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(false);
                    }
                });
            } catch (Throwable ignored) {}

            // 2. Hook LocationManager
            Class<?> lmClass = LocationManager.class;

            // A. getAllProviders
            XposedHelpers.findAndHookMethod(lmClass, "getAllProviders", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    List<String> list = new ArrayList<>(Arrays.asList(
                            LocationManager.GPS_PROVIDER,
                            LocationManager.NETWORK_PROVIDER,
                            LocationManager.PASSIVE_PROVIDER,
                            "fused"
                    ));
                    param.setResult(list);
                }
            });

            // B. getProviders(boolean enabledOnly)
            XposedHelpers.findAndHookMethod(lmClass, "getProviders", boolean.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    List<String> list = new ArrayList<>(Arrays.asList(
                            LocationManager.GPS_PROVIDER,
                            LocationManager.NETWORK_PROVIDER,
                            LocationManager.PASSIVE_PROVIDER,
                            "fused"
                    ));
                    param.setResult(list);
                }
            });

            // C. getProviders(Criteria, boolean)
            XposedHelpers.findAndHookMethod(lmClass, "getProviders", Criteria.class, boolean.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    List<String> list = new ArrayList<>(Arrays.asList(
                            LocationManager.GPS_PROVIDER,
                            LocationManager.NETWORK_PROVIDER,
                            "fused"
                    ));
                    param.setResult(list);
                }
            });

            // D. isProviderEnabled
            XposedHelpers.findAndHookMethod(lmClass, "isProviderEnabled", String.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String p = (String) param.args[0];
                    if (LocationManager.GPS_PROVIDER.equals(p) ||
                        LocationManager.NETWORK_PROVIDER.equals(p) ||
                        LocationManager.PASSIVE_PROVIDER.equals(p) ||
                        "fused".equals(p)) {
                        param.setResult(true);
                    }
                }
            });

            // E. isLocationEnabled
            try {
                XposedHelpers.findAndHookMethod(lmClass, "isLocationEnabled", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(true);
                    }
                });
            } catch (Throwable ignored) {}

            // F. getBestProvider
            XposedHelpers.findAndHookMethod(lmClass, "getBestProvider", Criteria.class, boolean.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(LocationManager.GPS_PROVIDER);
                }
            });

            // G. getLastKnownLocation
            XposedHelpers.findAndHookMethod(lmClass, "getLastKnownLocation", String.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String p = (String) param.args[0];
                    param.setResult(createLocation(p));
                }
            });

            // H. getLastLocation (Android 12/13)
            try {
                XposedHelpers.findAndHookMethod(lmClass, "getLastLocation", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(createLocation(LocationManager.GPS_PROVIDER));
                    }
                });
            } catch (Throwable ignored) {}

            // I. requestLocationUpdates (String, long, float, LocationListener)
            XposedHelpers.findAndHookMethod(lmClass, "requestLocationUpdates",
                    String.class, long.class, float.class, LocationListener.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            String provider = (String) param.args[0];
                            long minTime = (Long) param.args[1];
                            LocationListener listener = (LocationListener) param.args[3];
                            startLocationUpdates(listener, provider, minTime, null);
                            param.setResult(null);
                        }
                    });

            // J. requestLocationUpdates (String, long, float, LocationListener, Looper)
            XposedHelpers.findAndHookMethod(lmClass, "requestLocationUpdates",
                    String.class, long.class, float.class, LocationListener.class, Looper.class,
                    new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            String provider = (String) param.args[0];
                            long minTime = (Long) param.args[1];
                            LocationListener listener = (LocationListener) param.args[3];
                            Looper looper = (Looper) param.args[4];
                            Handler handler = looper != null ? new Handler(looper) : null;
                            startLocationUpdates(listener, provider, minTime, handler);
                            param.setResult(null);
                        }
                    });

            // K. removeUpdates(LocationListener)
            XposedHelpers.findAndHookMethod(lmClass, "removeUpdates", LocationListener.class, new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    LocationListener listener = (LocationListener) param.args[0];
                    stopLocationUpdates(listener);
                    param.setResult(null);
                }
            });

            // L. GNSS Hardware model & year (Pixel 5 Oficial)
            try {
                XposedHelpers.findAndHookMethod(lmClass, "getGnssYearOfHardware", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(2020);
                    }
                });
                XposedHelpers.findAndHookMethod(lmClass, "getGnssHardwareModelName", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult("Qualcomm SM7250 GNSS");
                    }
                });
            } catch (Throwable ignored) {}

        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: FakeGps hook error: " + t);
        }
    }
}
