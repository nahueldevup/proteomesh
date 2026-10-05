package com.fakewifi.pixel;

import android.hardware.Sensor;
import android.hardware.SensorEvent;
import android.hardware.SensorEventListener;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

import de.robv.android.xposed.XposedBridge;
import de.robv.android.xposed.XposedHelpers;

public class FakeSensors {

    private static final List<Sensor> sSensors = new ArrayList<>();
    private static final Map<Integer, Sensor> sTypeToSensor = new ConcurrentHashMap<>();
    private static final ScheduledExecutorService sScheduler = Executors.newScheduledThreadPool(2);
    private static final Map<SensorEventListener, List<ScheduledFuture<?>>> sActiveTasks = new ConcurrentHashMap<>();
    private static Handler sMainHandler;

    private static Handler getMainHandler() {
        if (sMainHandler == null) {
            try {
                sMainHandler = new Handler(Looper.getMainLooper());
            } catch (Throwable t) {
                // If MainLooper not ready, fallback
            }
        }
        return sMainHandler;
    }

    public static synchronized void initSensors() {
        if (!sSensors.isEmpty()) return;

        // 1. Accelerometer (BMI260)
        addSensor("BMI260 Accelerometer", "Bosch Sensortec", 1, 1, Sensor.TYPE_ACCELEROMETER,
                "android.sensor.accelerometer", 78.4532f, 0.002392822f, 0.18f, 2500, 200000);

        // 2. Magnetometer (AK09918)
        addSensor("AK09918 Magnetometer", "Asahi Kasei Microdevices", 1, 2, Sensor.TYPE_MAGNETIC_FIELD,
                "android.sensor.magnetic_field", 4912.0f, 0.15f, 1.1f, 10000, 200000);

        // 3. Gyroscope (BMI260)
        addSensor("BMI260 Gyroscope", "Bosch Sensortec", 1, 3, Sensor.TYPE_GYROSCOPE,
                "android.sensor.gyroscope", 34.906586f, 0.0010681152f, 0.7f, 2500, 200000);

        // 4. Ambient Light Sensor (TMD3702)
        addSensor("TMD3702 Ambient Light Sensor", "AMS AG", 1, 4, Sensor.TYPE_LIGHT,
                "android.sensor.light", 65535.0f, 1.0f, 0.15f, 100000, 1000000);

        // 5. Pressure / Barometer (BMP380)
        addSensor("BMP380 Pressure Sensor", "Bosch Sensortec", 1, 5, Sensor.TYPE_PRESSURE,
                "android.sensor.pressure", 1250.0f, 0.01f, 0.0032f, 20000, 1000000);

        // 6. Proximity Sensor (TMD3702)
        addSensor("TMD3702 Proximity Sensor", "AMS AG", 1, 6, Sensor.TYPE_PROXIMITY,
                "android.sensor.proximity", 5.0f, 1.0f, 0.15f, 0, 0);

        // 7. Gravity
        addSensor("Gravity", "Google", 1, 7, Sensor.TYPE_GRAVITY,
                "android.sensor.gravity", 78.4532f, 0.002392822f, 0.18f, 2500, 200000);

        // 8. Linear Acceleration
        addSensor("Linear Acceleration", "Google", 1, 8, Sensor.TYPE_LINEAR_ACCELERATION,
                "android.sensor.linear_acceleration", 78.4532f, 0.002392822f, 0.18f, 2500, 200000);

        // 9. Rotation Vector
        addSensor("Rotation Vector", "Google", 1, 9, Sensor.TYPE_ROTATION_VECTOR,
                "android.sensor.rotation_vector", 1.0f, 0.00001f, 0.88f, 2500, 200000);

        // 10. Step Counter
        addSensor("BMI260 Step Counter", "Bosch Sensortec", 1, 10, Sensor.TYPE_STEP_COUNTER,
                "android.sensor.step_counter", 4294967295.0f, 1.0f, 0.05f, 0, 0);

        // 11. Step Detector
        addSensor("BMI260 Step Detector", "Bosch Sensortec", 1, 11, Sensor.TYPE_STEP_DETECTOR,
                "android.sensor.step_detector", 1.0f, 1.0f, 0.05f, 0, 0);
    }

    private static void addSensor(String name, String vendor, int version, int handle, int type,
                                  String stringType, float maxRange, float resolution, float power,
                                  int minDelay, int maxDelay) {
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
            XposedHelpers.setIntField(s, "mMaxDelay", maxDelay);
            XposedHelpers.setObjectField(s, "mStringType", stringType);
            sSensors.add(s);
            sTypeToSensor.put(type, s);
        } catch (Throwable t) {
            XposedBridge.log("FakeSensors: Error creating sensor " + name + ": " + t);
        }
    }

    public static List<Sensor> getSensors(int type) {
        initSensors();
        if (type == Sensor.TYPE_ALL || type == -1) {
            return Collections.unmodifiableList(new ArrayList<>(sSensors));
        }
        Sensor s = sTypeToSensor.get(type);
        if (s != null) {
            List<Sensor> list = new ArrayList<>();
            list.add(s);
            return list;
        }
        return Collections.emptyList();
    }

    public static Sensor getDefaultSensor(int type) {
        initSensors();
        return sTypeToSensor.get(type);
    }

    public static void startSimulation(final SensorEventListener listener, final Sensor sensor, int delayUs, final Handler targetHandler) {
        if (listener == null || sensor == null) return;
        initSensors();

        long periodMs = delayUs > 0 ? (delayUs / 1000) : 40;
        if (periodMs < 15) periodMs = 15;
        if (periodMs > 200) periodMs = 200;

        ScheduledFuture<?> future = sScheduler.scheduleAtFixedRate(new Runnable() {
            @Override
            public void run() {
                try {
                    final SensorEvent event = (SensorEvent) XposedHelpers.newInstance(SensorEvent.class, 16);
                    event.sensor = sensor;
                    event.accuracy = 3; // SENSOR_STATUS_ACCURACY_HIGH
                    event.timestamp = SystemClock.elapsedRealtimeNanos();

                    double t = SystemClock.elapsedRealtime() / 1000.0;
                    int type = sensor.getType();

                    if (type == Sensor.TYPE_ACCELEROMETER) {
                        float jx = (float) (Math.sin(t * 3.7) * 0.012 + (Math.random() - 0.5) * 0.006);
                        float jy = (float) (Math.cos(t * 2.9) * 0.010 + (Math.random() - 0.5) * 0.006);
                        float jz = (float) (Math.sin(t * 1.5) * 0.015 + (Math.random() - 0.5) * 0.008);
                        event.values[0] = jx;
                        event.values[1] = jy;
                        event.values[2] = 9.80665f + jz;
                    } else if (type == Sensor.TYPE_GYROSCOPE) {
                        event.values[0] = (float) (Math.sin(t * 5.1) * 0.0015 + (Math.random() - 0.5) * 0.0008);
                        event.values[1] = (float) (Math.cos(t * 4.3) * 0.0012 + (Math.random() - 0.5) * 0.0008);
                        event.values[2] = (float) (Math.sin(t * 2.7) * 0.0010 + (Math.random() - 0.5) * 0.0005);
                    } else if (type == Sensor.TYPE_MAGNETIC_FIELD) {
                        event.values[0] = 15.2f + (float) (Math.sin(t) * 0.15 + (Math.random() - 0.5) * 0.05);
                        event.values[1] = -7.4f + (float) (Math.cos(t * 1.2) * 0.12 + (Math.random() - 0.5) * 0.05);
                        event.values[2] = 38.1f + (float) (Math.sin(t * 0.8) * 0.20 + (Math.random() - 0.5) * 0.08);
                    } else if (type == Sensor.TYPE_PRESSURE) {
                        event.values[0] = 1013.25f + (float) (Math.sin(t * 0.5) * 0.03 + (Math.random() - 0.5) * 0.01);
                    } else if (type == Sensor.TYPE_LIGHT) {
                        event.values[0] = 145.0f + (float) (Math.random() * 2.0 - 1.0);
                    } else if (type == Sensor.TYPE_PROXIMITY) {
                        event.values[0] = 5.0f;
                    } else if (type == Sensor.TYPE_GRAVITY) {
                        event.values[0] = 0.0f;
                        event.values[1] = 0.0f;
                        event.values[2] = 9.80665f;
                    } else if (type == Sensor.TYPE_LINEAR_ACCELERATION) {
                        event.values[0] = 0.0f;
                        event.values[1] = 0.0f;
                        event.values[2] = 0.0f;
                    } else if (type == Sensor.TYPE_ROTATION_VECTOR) {
                        event.values[0] = 0.0f;
                        event.values[1] = 0.0f;
                        event.values[2] = 0.0f;
                        event.values[3] = 1.0f;
                    } else if (type == Sensor.TYPE_STEP_COUNTER) {
                        event.values[0] = 1420.0f;
                    } else if (type == Sensor.TYPE_STEP_DETECTOR) {
                        event.values[0] = 1.0f;
                    }

                    Runnable dispatch = new Runnable() {
                        @Override
                        public void run() {
                            try {
                                listener.onSensorChanged(event);
                            } catch (Throwable ignored) {}
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
                    XposedBridge.log("FakeSensors: Error dispatching event: " + t);
                }
            }
        }, 0, periodMs, TimeUnit.MILLISECONDS);

        List<ScheduledFuture<?>> list = sActiveTasks.get(listener);
        if (list == null) {
            list = new ArrayList<>();
            sActiveTasks.put(listener, list);
        }
        list.add(future);
    }

    public static void stopSimulation(SensorEventListener listener) {
        if (listener == null) return;
        List<ScheduledFuture<?>> list = sActiveTasks.remove(listener);
        if (list != null) {
            for (ScheduledFuture<?> f : list) {
                f.cancel(true);
            }
        }
    }
}
