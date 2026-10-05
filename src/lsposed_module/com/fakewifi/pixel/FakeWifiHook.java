package com.fakewifi.pixel;

import android.content.pm.PackageManager;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.hardware.Camera;
import android.hardware.Sensor;
import android.hardware.SensorEventListener;
import android.hardware.SensorManager;
import android.os.Handler;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.wifi.SupplicantState;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.telephony.TelephonyManager;
import android.util.Range;
import android.util.Rational;
import android.util.Size;
import android.util.SizeF;

import java.lang.reflect.Field;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.Vector;

import de.robv.android.xposed.IXposedHookLoadPackage;
import de.robv.android.xposed.XC_MethodHook;
import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;
import de.robv.android.xposed.callbacks.XC_LoadPackage;

public class FakeWifiHook implements IXposedHookLoadPackage {

    private static final String SSID = "Personal-WiFi-5.8G";
    private static final String BSSID = "00:1a:2b:3c:4d:5e";
    private static final String MAC = "4e:b7:d0:03:31:a9";

    private static final java.util.Map<Object, String> sCameraIds =
        java.util.Collections.synchronizedMap(new java.util.WeakHashMap<Object, String>());

    private static Object sUnsafe = null;
    private static java.lang.reflect.Method sAllocateInstance = null;
    static {
        try {
            Class<?> unsafeClass = Class.forName("sun.misc.Unsafe");
            Field f = unsafeClass.getDeclaredField("theUnsafe");
            f.setAccessible(true);
            sUnsafe = f.get(null);
            sAllocateInstance = unsafeClass.getMethod("allocateInstance", Class.class);
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Unsafe initialization failed: " + t);
        }
    }

    private static Object allocateInstance(Class<?> clazz) {
        if (sUnsafe != null && sAllocateInstance != null) {
            try {
                return sAllocateInstance.invoke(sUnsafe, clazz);
            } catch (Throwable ignored) {}
        }
        return null;
    }

    private static List<Sensor> sCachedSensors = null;

    private static synchronized List<Sensor> getPixel5Sensors() {
        if (sCachedSensors != null) return sCachedSensors;
        List<Sensor> list = new ArrayList<>();
        try {
            list.add(createSensor("BMI260 Accelerometer", "Bosch Sensortec", 1, 1, Sensor.TYPE_ACCELEROMETER,
                    78.4532f, 0.00239282f, 0.18f, 2500, 3000, 3000, "android.sensor.accelerometer", 200000, 0));
            list.add(createSensor("AK09918 Magnetometer", "Asahi Kasei Microdevices", 1, 2, Sensor.TYPE_MAGNETIC_FIELD,
                    4912.0f, 0.15f, 0.10f, 10000, 600, 600, "android.sensor.magnetic_field", 200000, 0));
            list.add(createSensor("BMI260 Gyroscope", "Bosch Sensortec", 1, 3, Sensor.TYPE_GYROSCOPE,
                    34.906586f, 0.0010652644f, 0.55f, 2500, 3000, 3000, "android.sensor.gyroscope", 200000, 0));
            list.add(createSensor("TMD3702 Ambient Light Sensor", "AMS AG", 1, 4, Sensor.TYPE_LIGHT,
                    65535.0f, 1.0f, 0.09f, 200000, 0, 0, "android.sensor.light", 10000000, 2));
            list.add(createSensor("BMP380 Pressure Sensor", "Bosch Sensortec", 1, 5, Sensor.TYPE_PRESSURE,
                    1250.0f, 0.0018f, 0.015f, 20000, 300, 300, "android.sensor.pressure", 1000000, 0));
            list.add(createSensor("TMD3702 Proximity Sensor", "AMS AG", 1, 6, Sensor.TYPE_PROXIMITY,
                    5.0f, 5.0f, 0.18f, 200000, 0, 0, "android.sensor.proximity", 10000000, 3));
            list.add(createSensor("Gravity", "Google", 1, 7, Sensor.TYPE_GRAVITY,
                    78.4532f, 0.00239282f, 0.73f, 5000, 0, 0, "android.sensor.gravity", 100000, 0));
            list.add(createSensor("Linear Acceleration", "Google", 1, 8, Sensor.TYPE_LINEAR_ACCELERATION,
                    78.4532f, 0.00239282f, 0.73f, 5000, 0, 0, "android.sensor.linear_acceleration", 100000, 0));
            list.add(createSensor("Rotation Vector", "Google", 1, 9, Sensor.TYPE_ROTATION_VECTOR,
                    1.0f, 5.9604645e-8f, 0.73f, 5000, 0, 0, "android.sensor.rotation_vector", 100000, 0));
            list.add(createSensor("Step Counter", "Bosch Sensortec", 1, 10, Sensor.TYPE_STEP_COUNTER,
                    4294967295.0f, 1.0f, 0.02f, 0, 0, 0, "android.sensor.step_counter", 0, 2));
            list.add(createSensor("Step Detector", "Bosch Sensortec", 1, 11, Sensor.TYPE_STEP_DETECTOR,
                    1.0f, 1.0f, 0.02f, 0, 0, 0, "android.sensor.step_detector", 0, 6));
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Error initializing sensors: " + t);
        }
        sCachedSensors = list;
        return list;
    }

    private static Sensor createSensor(String name, String vendor, int version, int handle, int type,
                                      float maxRange, float resolution, float power, int minDelay,
                                      int fifoReserved, int fifoMax, String stringType, int maxDelay, int flags) {
        try {
            Sensor s = (Sensor) XposedHelpers.newInstance(Sensor.class);
            XposedHelpers.setObjectField(s, "mName", name);
            XposedHelpers.setObjectField(s, "mVendor", vendor);
            XposedHelpers.setIntField(s, "mVersion", version);
            XposedHelpers.setIntField(s, "mHandle", handle);
            XposedHelpers.setIntField(s, "mType", type);
            XposedHelpers.setFloatField(s, "mMaxRange", maxRange);
            XposedHelpers.setFloatField(s, "mResolution", resolution);
            XposedHelpers.setFloatField(s, "mPower", power);
            XposedHelpers.setIntField(s, "mMinDelay", minDelay);
            XposedHelpers.setIntField(s, "mFifoReservedEventCount", fifoReserved);
            XposedHelpers.setIntField(s, "mFifoMaxEventCount", fifoMax);
            XposedHelpers.setObjectField(s, "mStringType", stringType);
            XposedHelpers.setObjectField(s, "mRequiredPermission", "");
            XposedHelpers.setIntField(s, "mMaxDelay", maxDelay);
            XposedHelpers.setIntField(s, "mFlags", flags);
            XposedHelpers.setIntField(s, "mId", handle);
            return s;
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: createSensor failed: " + t);
            return null;
        }
    }

    private static boolean isSupportedFeature(String feature) {
        if (feature == null) return false;
        return feature.startsWith("android.hardware.camera") ||
               feature.startsWith("android.hardware.location") ||
               feature.equals("android.hardware.bluetooth") ||
               feature.equals("android.hardware.bluetooth_le") ||
               feature.equals("android.hardware.nfc") ||
               feature.equals("android.hardware.nfc.hce") ||
               feature.equals("android.hardware.uwb") ||
               feature.equals("android.hardware.wifi.direct") ||
               feature.equals("android.hardware.wifi.passpoint") ||
               feature.equals("android.hardware.wifi.aware") ||
               feature.equals("android.hardware.sensor.accelerometer") ||
               feature.equals("android.hardware.sensor.compass") ||
               feature.equals("android.hardware.sensor.gyroscope") ||
               feature.equals("android.hardware.sensor.light") ||
               feature.equals("android.hardware.sensor.proximity") ||
               feature.equals("android.hardware.sensor.barometer") ||
               feature.equals("android.hardware.sensor.stepcounter") ||
               feature.equals("android.hardware.sensor.stepdetector") ||
               feature.equals("android.hardware.telephony") ||
               feature.equals("android.hardware.telephony.gsm") ||
               feature.equals("android.hardware.telephony.ims");
    }

    private static Object createStreamConfigurationMap(String id) {
        try {
            Object map = allocateInstance(StreamConfigurationMap.class);
            if (map != null) {
                sCameraIds.put(map, id);
                return map;
            }
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: createStreamConfigurationMap error: " + t);
        }
        return null;
    }

    private static Size[] getSizesForCamera(String id, boolean isVideo) {
        if ("1".equals(id)) {
            // Front (8.0 MP)
            if (isVideo) {
                return new Size[]{ new Size(1920, 1080), new Size(1280, 720), new Size(640, 480) };
            }
            return new Size[]{ new Size(3264, 2448), new Size(1920, 1080), new Size(1280, 720) };
        } else if ("2".equals(id)) {
            // Ultrawide (16.0 MP)
            if (isVideo) {
                return new Size[]{ new Size(3840, 2160), new Size(1920, 1080), new Size(1280, 720) };
            }
            return new Size[]{ new Size(4608, 3456), new Size(3840, 2160), new Size(1920, 1080), new Size(1280, 720) };
        } else {
            // Back main (12.2 MP)
            if (isVideo) {
                return new Size[]{ new Size(3840, 2160), new Size(1920, 1080), new Size(1280, 720) };
            }
            return new Size[]{ new Size(4032, 3024), new Size(3840, 2160), new Size(1920, 1080), new Size(1280, 720) };
        }
    }

    private static Object getCameraCharacteristicValue(String id, String name) {
        boolean isFront = "1".equals(id);
        boolean isWide = "2".equals(id);

        if ("android.colorCorrection.availableAberrationModes".equals(name)) {
            return new int[]{ 0, 1, 2 }; // OFF, FAST, HIGH_QUALITY
        }
        if ("android.control.aeAvailableAntibandingModes".equals(name)) {
            return new int[]{ 0, 1, 2, 3 }; // OFF, 50HZ, 60HZ, AUTO
        }
        if ("android.control.aeAvailableModes".equals(name)) {
            return isFront ? new int[]{ 0, 1 } : new int[]{ 0, 1, 2, 3 };
        }
        if ("android.control.aeCompensationRange".equals(name)) {
            return new Range<>(-24, 24);
        }
        if ("android.control.aeCompensationStep".equals(name)) {
            return new Rational(1, 6);
        }
        if ("android.control.aeLockAvailable".equals(name)) {
            return true;
        }
        if ("android.control.aeAvailableTargetFpsRanges".equals(name)) {
            return new Range<?>[]{ new Range<>(15, 30), new Range<>(30, 30), new Range<>(15, 60), new Range<>(60, 60) };
        }
        if ("android.control.afAvailableModes".equals(name)) {
            return isFront ? new int[]{ 0, 1 } : new int[]{ 0, 1, 2, 3, 4 };
        }
        if ("android.control.availableEffects".equals(name)) {
            return new int[]{ 0 };
        }
        if ("android.control.availableSceneModes".equals(name)) {
            return new int[]{ 0 };
        }
        if ("android.control.availableVideoStabilizationModes".equals(name)) {
            return new int[]{ 0, 1 };
        }
        if ("android.control.awbAvailableModes".equals(name)) {
            return new int[]{ 0, 1, 2, 3, 4, 5, 6, 7 };
        }
        if ("android.control.awbLockAvailable".equals(name)) {
            return true;
        }
        if ("android.control.maxRegionsAe".equals(name)) {
            return 1;
        }
        if ("android.control.maxRegionsAf".equals(name)) {
            return 1;
        }
        if ("android.control.maxRegionsAwb".equals(name)) {
            return 1;
        }
        if ("android.edge.availableEdgeModes".equals(name)) {
            return new int[]{ 0, 1, 2, 3 };
        }
        if ("android.flash.info.available".equals(name)) {
            return !isFront;
        }
        if ("android.hotPixel.availableHotPixelModes".equals(name)) {
            return new int[]{ 0, 1, 2 };
        }
        if ("android.info.supportedHardwareLevel".equals(name)) {
            return CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL;
        }
        if ("android.jpeg.availableThumbnailSizes".equals(name)) {
            return new Size[]{ new Size(0, 0), new Size(160, 120), new Size(240, 144), new Size(256, 144) };
        }
        if ("android.lens.facing".equals(name)) {
            return isFront ? CameraCharacteristics.LENS_FACING_FRONT : CameraCharacteristics.LENS_FACING_BACK;
        }
        if ("android.lens.info.availableApertures".equals(name)) {
            return isFront ? new float[]{ 2.00f } : (isWide ? new float[]{ 2.20f } : new float[]{ 1.73f });
        }
        if ("android.lens.info.availableFilterDensities".equals(name)) {
            return new float[]{ 0.0f };
        }
        if ("android.lens.info.availableFocalLengths".equals(name)) {
            return isFront ? new float[]{ 2.00f } : (isWide ? new float[]{ 2.22f } : new float[]{ 4.38f });
        }
        if ("android.lens.info.availableOpticalStabilization".equals(name)) {
            return isFront ? new int[]{ 0 } : new int[]{ 0, 1 };
        }
        if ("android.lens.info.focusDistanceCalibration".equals(name)) {
            return isFront ? 0 : 2; // CALIBRATED
        }
        if ("android.lens.info.hyperfocalDistance".equals(name)) {
            return isFront ? 0.0f : 0.45f;
        }
        if ("android.lens.info.minimumFocusDistance".equals(name)) {
            return isFront ? 0.0f : 10.0f;
        }
        if ("android.request.availableCapabilities".equals(name)) {
            return new int[]{ 0, 1, 2, 3, 4 };
        }
        if ("android.request.maxNumOutputProc".equals(name)) {
            return 3;
        }
        if ("android.request.maxNumOutputProcStalling".equals(name)) {
            return 1;
        }
        if ("android.request.maxNumOutputRaw".equals(name)) {
            return 1;
        }
        if ("android.request.partialResultCount".equals(name)) {
            return 1;
        }
        if ("android.request.pipelineMaxDepth".equals(name)) {
            return (byte) 8;
        }
        if ("android.scaler.availableMaxDigitalZoom".equals(name)) {
            return isFront ? 4.0f : 7.0f;
        }
        if ("android.scaler.croppingType".equals(name)) {
            return 0; // CENTER_ONLY
        }
        if ("android.scaler.streamConfigurationMap".equals(name)) {
            return createStreamConfigurationMap(id);
        }
        if ("android.sensor.availableTestPatternModes".equals(name)) {
            return new int[]{ 0 };
        }
        if ("android.sensor.info.activeArraySize".equals(name)) {
            return isFront ? new Rect(0, 0, 3264, 2448) : (isWide ? new Rect(0, 0, 4608, 3456) : new Rect(0, 0, 4032, 3024));
        }
        if ("android.sensor.info.colorFilterArrangement".equals(name)) {
            return 0; // RGGB
        }
        if ("android.sensor.info.exposureTimeRange".equals(name)) {
            return new Range<>(10000L, 30000000000L);
        }
        if ("android.sensor.info.physicalSize".equals(name)) {
            return isFront ? new SizeF(3.600f, 2.700f) : (isWide ? new SizeF(6.170f, 4.630f) : new SizeF(5.645f, 4.234f));
        }
        if ("android.sensor.info.pixelArraySize".equals(name)) {
            return isFront ? new Size(3264, 2448) : (isWide ? new Size(4608, 3456) : new Size(4032, 3024));
        }
        if ("android.sensor.info.sensitivityRange".equals(name)) {
            return new Range<>(55, 6400);
        }
        if ("android.sensor.info.timestampSource".equals(name)) {
            return 1; // REALTIME
        }
        if ("android.sensor.maxAnalogSensitivity".equals(name)) {
            return 1600;
        }
        if ("android.sensor.orientation".equals(name)) {
            return isFront ? 270 : 90;
        }
        if ("android.statistics.info.availableFaceDetectModes".equals(name)) {
            return new int[]{ 0, 1, 2 };
        }
        if ("android.statistics.info.maxFaceCount".equals(name)) {
            return 10;
        }
        return null;
    }

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) throws Throwable {
        XposedBridge.log("FakeWifiPixel: Hooking package: " + lpparam.packageName);

        // ==========================================
        // 0. Hook PackageManager.hasSystemFeature
        // ==========================================
        try {
            XC_MethodHook featureHook = new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    String feature = (String) param.args[0];
                    if (isSupportedFeature(feature)) {
                        param.setResult(true);
                    }
                }
            };

            try {
                Class<?> appPmClass = XposedHelpers.findClass("android.app.ApplicationPackageManager", lpparam.classLoader);
                if (appPmClass != null) {
                    XposedHelpers.findAndHookMethod(appPmClass, "hasSystemFeature", String.class, featureHook);
                    XposedHelpers.findAndHookMethod(appPmClass, "hasSystemFeature", String.class, int.class, featureHook);
                }
            } catch (Throwable ignored) {}
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: PackageManager hook error: " + t);
        }

        // ==========================================
        // 0.5 Hook android.os.Build & SystemProperties
        // ==========================================
        try {
            XposedHelpers.setStaticObjectField(android.os.Build.class, "SUPPORTED_ABIS", new String[]{"arm64-v8a", "armeabi-v7a", "armeabi"});
            XposedHelpers.setStaticObjectField(android.os.Build.class, "SUPPORTED_64_BIT_ABIS", new String[]{"arm64-v8a"});
            XposedHelpers.setStaticObjectField(android.os.Build.class, "SUPPORTED_32_BIT_ABIS", new String[]{"armeabi-v7a", "armeabi"});
            XposedHelpers.setStaticObjectField(android.os.Build.class, "CPU_ABI", "arm64-v8a");
            XposedHelpers.setStaticObjectField(android.os.Build.class, "CPU_ABI2", "");
            XposedHelpers.setStaticObjectField(android.os.Build.class, "HARDWARE", "qcom");
            XposedHelpers.setStaticObjectField(android.os.Build.class, "BOARD", "redfin");
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Error spoofing Build ABIs: " + t);
        }

        try {
            Class<?> spClass = XposedHelpers.findClass("android.os.SystemProperties", lpparam.classLoader);
            XC_MethodHook propHook = new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    String key = (String) param.args[0];
                    if ("ro.product.cpu.abi".equals(key)) param.setResult("arm64-v8a");
                    else if ("ro.product.cpu.abilist".equals(key)) param.setResult("arm64-v8a,armeabi-v7a,armeabi");
                    else if ("ro.product.cpu.abilist64".equals(key)) param.setResult("arm64-v8a");
                    else if ("ro.product.cpu.abilist32".equals(key)) param.setResult("armeabi-v7a,armeabi");
                    else if ("ro.board.platform".equals(key)) param.setResult("sm7250");
                    else if ("ro.hardware".equals(key)) param.setResult("qcom");
                }
            };
            XposedHelpers.findAndHookMethod(spClass, "get", String.class, propHook);
            XposedHelpers.findAndHookMethod(spClass, "get", String.class, String.class, propHook);
        } catch (Throwable ignored) {}

        // ==========================================
        // 1. Hook NetworkCapabilities & Wi-Fi
        // ==========================================
        try {
            XposedHelpers.findAndHookMethod(NetworkCapabilities.class, "hasTransport", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    int transport = (Integer) param.args[0];
                    if (transport == NetworkCapabilities.TRANSPORT_WIFI || transport == 5 /* TRANSPORT_WIFI_AWARE */) {
                        param.setResult(true);
                    } else if (transport == NetworkCapabilities.TRANSPORT_ETHERNET) {
                        param.setResult(false);
                    }
                }
            });

            XposedHelpers.findAndHookMethod(NetworkCapabilities.class, "getTransportTypes", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(new int[]{ NetworkCapabilities.TRANSPORT_WIFI });
                }
            });

            Class<?> lpClass = XposedHelpers.findClass("android.net.LinkProperties", lpparam.classLoader);
            if (lpClass != null) {
                XposedHelpers.findAndHookMethod(lpClass, "getInterfaceName", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult("wlan0");
                    }
                });
            }

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "getType", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(ConnectivityManager.TYPE_WIFI);
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "getTypeName", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("WIFI");
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "isConnected", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "isConnectedOrConnecting", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "getState", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(NetworkInfo.State.CONNECTED);
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInfo.class, "getDetailedState", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(NetworkInfo.DetailedState.CONNECTED);
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "isWifiEnabled", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "getWifiState", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(WifiManager.WIFI_STATE_ENABLED);
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "is5GHzBandSupported", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "is6GHzBandSupported", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(false);
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "isWifiStandardSupported", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getSSID", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("\"" + SSID + "\"");
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getBSSID", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(BSSID);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getMacAddress", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(MAC);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getRssi", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(-52);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getLinkSpeed", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(866);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getFrequency", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(5180);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getNetworkId", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(1);
                }
            });

            XposedHelpers.findAndHookMethod(WifiInfo.class, "getSupplicantState", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(SupplicantState.COMPLETED);
                }
            });

            try {
                XposedHelpers.findAndHookMethod(WifiInfo.class, "getWifiStandard", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(5); // 802.11ac (Wi-Fi 5)
                    }
                });
            } catch (Throwable ignored) {}

            XposedHelpers.findAndHookMethod(WifiManager.class, "getConnectionInfo", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    try {
                        WifiInfo info = (WifiInfo) param.getResult();
                        if (info == null) {
                            info = (WifiInfo) XposedHelpers.newInstance(WifiInfo.class);
                        }
                        XposedHelpers.setIntField(info, "mNetworkId", 1);
                        XposedHelpers.setIntField(info, "mRssi", -52);
                        XposedHelpers.setIntField(info, "mLinkSpeed", 866);
                        XposedHelpers.setIntField(info, "mFrequency", 5180);
                        XposedHelpers.setObjectField(info, "mBSSID", BSSID);
                        XposedHelpers.setObjectField(info, "mMacAddress", MAC);
                        XposedHelpers.setObjectField(info, "mSupplicantState", SupplicantState.COMPLETED);
                        param.setResult(info);
                    } catch (Throwable t) {
                        XposedBridge.log("FakeWifiPixel: Error mocking WifiInfo: " + t);
                    }
                }
            });

            XposedHelpers.findAndHookMethod(WifiManager.class, "getDhcpInfo", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    try {
                        android.net.DhcpInfo dhcp = new android.net.DhcpInfo();
                        dhcp.ipAddress = 0x020012ac; // 172.18.0.2
                        dhcp.gateway = 0x010012ac;   // 172.18.0.1
                        dhcp.netmask = 0x0000ffff;   // 255.255.0.0
                        dhcp.dns1 = 0x08080808;      // 8.8.8.8
                        dhcp.dns2 = 0x04040808;      // 8.8.4.4
                        dhcp.serverAddress = 0x010012ac;
                        dhcp.leaseDuration = 86400;
                        param.setResult(dhcp);
                    } catch (Throwable ignored) {}
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInterface.class, "getName", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String name = (String) param.getResult();
                    if ("eth0".equals(name)) {
                        param.setResult("wlan0");
                    }
                }
            });

            XposedHelpers.findAndHookMethod(NetworkInterface.class, "getDisplayName", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String name = (String) param.getResult();
                    if ("eth0".equals(name)) {
                        param.setResult("wlan0");
                    }
                }
            });
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Network hook error: " + t);
        }

        // ==========================================
        // 2. Hook TelephonyManager (Personal Argentina)
        // ==========================================
        try {
            try {
                XposedHelpers.findAndHookMethod(TelephonyManager.class, "getActiveModemCount", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(1);
                    }
                });
                XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSupportedModemCount", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(1);
                    }
                });
                XposedHelpers.findAndHookMethod(TelephonyManager.class, "getPhoneCount", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(1);
                    }
                });
            } catch (Throwable ignored) {}

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimState", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(TelephonyManager.SIM_STATE_READY);
                }
            });

            try {
                XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimState", int.class, new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(TelephonyManager.SIM_STATE_READY);
                    }
                });
            } catch (Throwable ignored) {}

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "hasIccCard", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(true);
                }
            });

            try {
                XposedHelpers.findAndHookMethod(TelephonyManager.class, "hasIccCard", int.class, new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(true);
                    }
                });
            } catch (Throwable ignored) {}

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimOperator", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("72234");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimOperatorName", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("Personal");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getNetworkOperator", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("72234");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getNetworkOperatorName", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("Personal");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimCountryIso", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("ar");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getNetworkCountryIso", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("ar");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getPhoneType", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(TelephonyManager.PHONE_TYPE_GSM);
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getNetworkType", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(TelephonyManager.NETWORK_TYPE_LTE);
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getDataNetworkType", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(TelephonyManager.NETWORK_TYPE_LTE);
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getVoiceNetworkType", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(TelephonyManager.NETWORK_TYPE_LTE);
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSimSerialNumber", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("8954341000123456789");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getSubscriberId", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("722341000123456");
                }
            });

            XposedHelpers.findAndHookMethod(TelephonyManager.class, "getLine1Number", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult("+5491138492011");
                }
            });
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Telephony hook error: " + t);
        }

        // ==========================================
        // 3. Hook SensorManager & SystemSensorManager (Pixel 5 Sensors)
        // ==========================================
        try {
            FakeSensors.initSensors();

            Class<?> smClass = XposedHelpers.findClass("android.hardware.SensorManager", lpparam.classLoader);

            XposedHelpers.findAndHookMethod(smClass, "getSensorList", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    int type = (Integer) param.args[0];
                    param.setResult(FakeSensors.getSensors(type));
                }
            });

            XposedHelpers.findAndHookMethod(smClass, "getDefaultSensor", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    int type = (Integer) param.args[0];
                    Sensor s = FakeSensors.getDefaultSensor(type);
                    if (s != null) {
                        param.setResult(s);
                    }
                }
            });

            try {
                XposedHelpers.findAndHookMethod(smClass, "getDefaultSensor", int.class, boolean.class, new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        int type = (Integer) param.args[0];
                        Sensor s = FakeSensors.getDefaultSensor(type);
                        if (s != null) {
                            param.setResult(s);
                        }
                    }
                });
            } catch (Throwable ignored) {}

            Class<?> ssmClass = XposedHelpers.findClass("android.hardware.SystemSensorManager", lpparam.classLoader);
            if (ssmClass != null) {
                try {
                    XposedHelpers.findAndHookMethod(ssmClass, "getFullSensorList", new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            param.setResult(FakeSensors.getSensors(-1));
                        }
                    });
                } catch (Throwable ignored) {}

                try {
                    XposedHelpers.findAndHookMethod(ssmClass, "registerListenerImpl",
                            SensorEventListener.class,
                            Sensor.class,
                            int.class,
                            Handler.class,
                            int.class,
                            int.class,
                            new XC_MethodHook() {
                                @Override
                                protected void beforeHookedMethod(MethodHookParam param) {
                                    SensorEventListener listener = (SensorEventListener) param.args[0];
                                    Sensor sensor = (Sensor) param.args[1];
                                    int delayUs = (Integer) param.args[2];
                                    Handler handler = (Handler) param.args[3];

                                    FakeSensors.startSimulation(listener, sensor, delayUs, handler);
                                    param.setResult(true);
                                }
                            });
                } catch (Throwable ignored) {}

                try {
                    XposedHelpers.findAndHookMethod(ssmClass, "unregisterListenerImpl",
                            SensorEventListener.class,
                            Sensor.class,
                            new XC_MethodHook() {
                                @Override
                                protected void beforeHookedMethod(MethodHookParam param) {
                                    SensorEventListener listener = (SensorEventListener) param.args[0];
                                    FakeSensors.stopSimulation(listener);
                                    param.setResult(true);
                                }
                            });
                } catch (Throwable ignored) {}
            }
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Sensor hook error: " + t);
        }

        // ==========================================
        // 4. Hook CameraManager & Camera (Pixel 5 Cameras)
        // ==========================================
        try {
            // A. CameraManager getCameraIdList
            XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraIdList", new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    param.setResult(new String[]{"0", "1", "2"});
                }
            });

            try {
                XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraIdListNoCache", new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(new String[]{"0", "1", "2"});
                    }
                });
            } catch (Throwable ignored) {}

            // B. CameraManager getCameraCharacteristics
            XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraCharacteristics", String.class, new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    String id = (String) param.args[0];
                    if (id == null) id = "0";
                    try {
                        Object chars = allocateInstance(CameraCharacteristics.class);
                        if (chars != null) {
                            sCameraIds.put(chars, id);
                            param.setResult(chars);
                        }
                    } catch (Throwable t) {
                        XposedBridge.log("FakeWifiPixel: Error allocating CameraCharacteristics: " + t);
                    }
                }
            });

            // C. CameraCharacteristics.get(Key)
            XposedHelpers.findAndHookMethod(CameraCharacteristics.class, "get", CameraCharacteristics.Key.class, new XC_MethodHook() {
                @Override
                protected void beforeHookedMethod(MethodHookParam param) {
                    CameraCharacteristics.Key<?> key = (CameraCharacteristics.Key<?>) param.args[0];
                    if (key == null) return;
                    String name = key.getName();

                    String id = sCameraIds.get(param.thisObject);
                    if (id == null) id = "0";

                    Object val = getCameraCharacteristicValue(id, name);
                    param.setResult(val);
                }
            });

            // D. CameraCharacteristics getPhysicalCameraIds
            try {
                XposedHelpers.findAndHookMethod(CameraCharacteristics.class, "getPhysicalCameraIds", new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(Collections.emptySet());
                    }
                });
            } catch (Throwable ignored) {}

            // E. CameraCharacteristics getKeys
            try {
                XposedHelpers.findAndHookMethod(CameraCharacteristics.class, "getKeys", new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(Collections.emptyList());
                    }
                });
            } catch (Throwable ignored) {}

            // F. StreamConfigurationMap getOutputSizes
            try {
                XposedHelpers.findAndHookMethod(StreamConfigurationMap.class, "getOutputSizes", int.class, new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        String id = sCameraIds.get(param.thisObject);
                        if (id == null) id = "0";
                        param.setResult(getSizesForCamera(id, false));
                    }
                });

                XposedHelpers.findAndHookMethod(StreamConfigurationMap.class, "getOutputSizes", Class.class, new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        String id = sCameraIds.get(param.thisObject);
                        if (id == null) id = "0";
                        param.setResult(getSizesForCamera(id, true));
                    }
                });

                XposedHelpers.findAndHookMethod(StreamConfigurationMap.class, "getOutputFormats", new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        param.setResult(new int[]{ ImageFormat.JPEG, ImageFormat.YUV_420_888 });
                    }
                });
            } catch (Throwable t) {
                XposedBridge.log("FakeWifiPixel: StreamConfigurationMap hook error: " + t);
            }

            // G. Legacy Camera API 1 (android.hardware.Camera)
            try {
                Class<?> cameraClass = XposedHelpers.findClass("android.hardware.Camera", lpparam.classLoader);
                if (cameraClass != null) {
                    XposedHelpers.findAndHookMethod(cameraClass, "getNumberOfCameras", new XC_MethodHook() {
                        @Override
                        protected void beforeHookedMethod(MethodHookParam param) {
                            param.setResult(2);
                        }
                    });

                    Class<?> infoClass = XposedHelpers.findClass("android.hardware.Camera$CameraInfo", lpparam.classLoader);
                    if (infoClass != null) {
                        XposedHelpers.findAndHookMethod(cameraClass, "getCameraInfo", int.class, infoClass, new XC_MethodHook() {
                            @Override
                            protected void beforeHookedMethod(MethodHookParam param) {
                                int id = (Integer) param.args[0];
                                Object info = param.args[1];
                                if (info != null) {
                                    if (id == 1) {
                                        XposedHelpers.setIntField(info, "facing", 1 /* CAMERA_FACING_FRONT */);
                                        XposedHelpers.setIntField(info, "orientation", 270);
                                    } else {
                                        XposedHelpers.setIntField(info, "facing", 0 /* CAMERA_FACING_BACK */);
                                        XposedHelpers.setIntField(info, "orientation", 90);
                                    }
                                }
                                param.setResult(null);
                            }
                        });
                    }
                }
            } catch (Throwable t) {
                XposedBridge.log("FakeWifiPixel: Legacy Camera hook error: " + t);
            }

        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Camera hook error: " + t);
        }

        // ==========================================
        // 5. Hook LocationManager & GPS (Pixel 5 GNSS)
        // ==========================================
        try {
            FakeGps.hook(lpparam);
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: FakeGps hook error: " + t);
        }
    }
}
