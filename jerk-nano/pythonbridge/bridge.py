import serial, time, threading
from flask import Flask, jsonify

SERIAL_PORT = "/dev/ttyUSB0"
BAUD_RATE = 9600

latest_jerk = {"jerk": 0.0, "timestamp": 0, "received_at_ms": 0}

def serial_reader():
    global latest_jerk
    ser = serial.Serial(SERIAL_PORT, BAUD_RATE, timeout=1)
    time.sleep(2)
    print("✅ Serial connected")

    while True:
        line = ser.readline().decode("utf-8", errors="ignore").strip()
        if not line:
            continue
        parts = line.split(",")
        if len(parts) != 2:
            continue
        try:
            jerk_value = float(parts[0])
            nano_ts = int(parts[1])
            latest_jerk = {
                "jerk": jerk_value,
                "timestamp": nano_ts,
                "received_at_ms": int(time.time() * 1000)
            }
        except:
            continue

app = Flask(__name__)

@app.route("/api/latest-jerk")
def latest():
    return jsonify(latest_jerk)

if __name__ == "__main__":
    threading.Thread(target=serial_reader, daemon=True).start()
    app.run(host="0.0.0.0", port=4000)