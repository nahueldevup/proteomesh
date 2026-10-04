package com.fakewifi.pixel;

import android.content.pm.PackageManager;
import android.graphics.Rect;
import android.hardware.Camera;
import android.hardware.Sensor;
import android.hardware.SensorManager;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.NetworkInfo;
import android.net.wifi.SupplicantState;
import android.net.wifi.WifiInfo;
import android.net.wifi.WifiManager;
import android.telephony.TelephonyManager;
import android.util.Range;
import android.util.Size;
import android.util.SizeF;

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

    @Override
    public void handleLoadPackage(XC_LoadPackage.LoadPackageParam lpparam) throws Throwable {
        XposedBridge.log("FakeWifiPixel: Hooking package: " + lpparam.packageName);

        // ==========================================
        // 0. Hook PackageManager.hasSystemFeature
        // ==========================================
        try {
            XC_MethodHook featureHook = new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    String feature = (String) param.args[0];
                    if (isSupportedFeature(feature)) {
                        param.setResult(true);
                    }
                }
            };

            XposedHelpers.findAndHookMethod(PackageManager.class, "hasSystemFeature", String.class, featureHook);
            try {
                XposedHelpers.findAndHookMethod(PackageManager.class, "hasSystemFeature", String.class, int.class, featureHook);
            } catch (Throwable ignored) {}

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

            XposedHelpers.findAndHookMethod(WifiManager.class, "getConnectionInfo", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    try {
                        WifiInfo info = (WifiInfo) XposedHelpers.newInstance(WifiInfo.class);
                        XposedHelpers.setObjectField(info, "mSSID", "\"" + SSID + "\"");
                        XposedHelpers.setObjectField(info, "mBSSID", BSSID);
                        XposedHelpers.setObjectField(info, "mMacAddress", MAC);
                        XposedHelpers.setIntField(info, "mRssi", -52);
                        XposedHelpers.setIntField(info, "mLinkSpeed", 866);
                        XposedHelpers.setIntField(info, "mFrequency", 5180);
                        XposedHelpers.setIntField(info, "mNetworkId", 1);
                        XposedHelpers.setObjectField(info, "mSupplicantState", SupplicantState.COMPLETED);
                        param.setResult(info);
                    } catch (Throwable t) {
                        XposedBridge.log("FakeWifiPixel: Error mocking WifiInfo: " + t);
                    }
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
        // 3. Hook SensorManager (Pixel 5 Sensors)
        // ==========================================
        try {
            XposedHelpers.findAndHookMethod(SensorManager.class, "getSensorList", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    int type = (Integer) param.args[0];
                    List<Sensor> all = getPixel5Sensors();
                    if (type == Sensor.TYPE_ALL) {
                        param.setResult(new ArrayList<>(all));
                    } else {
                        List<Sensor> filtered = new ArrayList<>();
                        for (Sensor s : all) {
                            if (s != null && s.getType() == type) {
                                filtered.add(s);
                            }
                        }
                        param.setResult(filtered);
                    }
                }
            });

            XposedHelpers.findAndHookMethod(SensorManager.class, "getDefaultSensor", int.class, new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    int type = (Integer) param.args[0];
                    List<Sensor> all = getPixel5Sensors();
                    for (Sensor s : all) {
                        if (s != null && s.getType() == type) {
                            param.setResult(s);
                            return;
                        }
                    }
                }
            });
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Sensor hook error: " + t);
        }

        // ==========================================
        // 4. Hook CameraManager & Camera (Pixel 5 Cameras)
        // ==========================================
        try {
            XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraIdList", new XC_MethodHook() {
                @Override
                protected void afterHookedMethod(MethodHookParam param) {
                    param.setResult(new String[]{"0", "1", "2"});
                }
            });

            try {
                XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraIdListNoCache", new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        param.setResult(new String[]{"0", "1", "2"});
                    }
                });
            } catch (Throwable ignored) {}

            try {
                Class<?> cameraClass = XposedHelpers.findClass("android.hardware.Camera", lpparam.classLoader);
                if (cameraClass != null) {
                    XposedHelpers.findAndHookMethod(cameraClass, "getNumberOfCameras", new XC_MethodHook() {
                        @Override
                        protected void afterHookedMethod(MethodHookParam param) {
                            param.setResult(2);
                        }
                    });

                    Class<?> infoClass = XposedHelpers.findClass("android.hardware.Camera$CameraInfo", lpparam.classLoader);
                    if (infoClass != null) {
                        XposedHelpers.findAndHookMethod(cameraClass, "getCameraInfo", int.class, infoClass, new XC_MethodHook() {
                            @Override
                            protected void afterHookedMethod(MethodHookParam param) {
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
                            }
                        });
                    }
                }
            } catch (Throwable t) {
                XposedBridge.log("FakeWifiPixel: Legacy Camera hook error: " + t);
            }

            // Hook CameraManager.getCameraCharacteristics to return mock without exception
            try {
                final Class<?> nativeClass = XposedHelpers.findClass("android.hardware.camera2.impl.CameraMetadataNative", lpparam.classLoader);
                XposedHelpers.findAndHookMethod(CameraManager.class, "getCameraCharacteristics", String.class, new XC_MethodHook() {
                    @Override
                    protected void beforeHookedMethod(MethodHookParam param) {
                        String id = (String) param.args[0];
                        if (id == null) id = "0";
                        try {
                            Object nativeProps = XposedHelpers.newInstance(nativeClass);
                            Object chars = XposedHelpers.newInstance(CameraCharacteristics.class, nativeProps);
                            XposedHelpers.setAdditionalInstanceField(chars, "fakeCameraId", id);
                            param.setResult(chars);
                        } catch (Throwable t) {
                            XposedBridge.log("FakeWifiPixel: Error creating CameraCharacteristics: " + t);
                        }
                    }
                });
            } catch (Throwable t) {
                XposedBridge.log("FakeWifiPixel: CameraCharacteristics creation hook error: " + t);
            }

            try {
                XposedHelpers.findAndHookMethod(CameraCharacteristics.class, "get", CameraCharacteristics.Key.class, new XC_MethodHook() {
                    @Override
                    protected void afterHookedMethod(MethodHookParam param) {
                        CameraCharacteristics.Key<?> key = (CameraCharacteristics.Key<?>) param.args[0];
                        if (key == null) return;
                        String name = key.getName();

                        String id = (String) XposedHelpers.getAdditionalInstanceField(param.thisObject, "fakeCameraId");
                        if (id == null) id = "0";

                        if ("android.lens.facing".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(CameraCharacteristics.LENS_FACING_FRONT);
                            } else {
                                param.setResult(CameraCharacteristics.LENS_FACING_BACK);
                            }
                        } else if ("android.sensor.info.pixelArraySize".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(new Size(3264, 2448)); // 8.0 MP
                            } else if ("2".equals(id)) {
                                param.setResult(new Size(4608, 3456)); // 16.0 MP
                            } else {
                                param.setResult(new Size(4032, 3024)); // 12.2 MP
                            }
                        } else if ("android.sensor.info.activeArraySize".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(new Rect(0, 0, 3264, 2448));
                            } else if ("2".equals(id)) {
                                param.setResult(new Rect(0, 0, 4608, 3456));
                            } else {
                                param.setResult(new Rect(0, 0, 4032, 3024));
                            }
                        } else if ("android.sensor.info.physicalSize".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(new SizeF(3.600f, 2.700f));
                            } else if ("2".equals(id)) {
                                param.setResult(new SizeF(6.170f, 4.630f));
                            } else {
                                param.setResult(new SizeF(5.645f, 4.234f));
                            }
                        } else if ("android.lens.info.availableFocalLengths".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(new float[]{2.00f});
                            } else if ("2".equals(id)) {
                                param.setResult(new float[]{2.22f});
                            } else {
                                param.setResult(new float[]{4.38f});
                            }
                        } else if ("android.lens.info.availableApertures".equals(name)) {
                            if ("1".equals(id)) {
                                param.setResult(new float[]{2.00f});
                            } else if ("2".equals(id)) {
                                param.setResult(new float[]{2.20f});
                            } else {
                                param.setResult(new float[]{1.73f});
                            }
                        } else if ("android.info.supportedHardwareLevel".equals(name)) {
                            param.setResult(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL_FULL);
                        } else if ("android.control.aeAvailableTargetFpsRanges".equals(name)) {
                            param.setResult(new Range<?>[]{ new Range<>(15, 30), new Range<>(30, 30), new Range<>(15, 60), new Range<>(60, 60) });
                        }
                    }
                });
            } catch (Throwable t) {
                XposedBridge.log("FakeWifiPixel: CameraCharacteristics.get hook error: " + t);
            }
        } catch (Throwable t) {
            XposedBridge.log("FakeWifiPixel: Camera hook error: " + t);
        }
    }
}