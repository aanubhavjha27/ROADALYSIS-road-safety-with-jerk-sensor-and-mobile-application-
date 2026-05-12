#include <Arduino.h>
#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <LiquidCrystal_I2C.h>

Adafruit_MPU6050 mpu;
LiquidCrystal_I2C lcd(0x27, 16, 2);

float lastForce = 0;

void setup() {
  Serial.begin(9600);
  Wire.begin();

  lcd.init();
  lcd.backlight();

  lcd.setCursor(0, 0);
  lcd.print("MPU Initializing");

  if (!mpu.begin()) {
    lcd.clear();
    lcd.print("MPU ERROR!");
    while (1);
  }

  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);

  delay(1500);
  lcd.clear();
}

void loop() {

  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float force = sqrt(
    a.acceleration.x * a.acceleration.x +
    a.acceleration.y * a.acceleration.y +
    a.acceleration.z * a.acceleration.z
  ) / 9.81;

  float jerk = abs(force - lastForce);
  lastForce = force;

  unsigned long timestamp = millis();

  // ---- CLASSIFICATION ----
  String level;
  if (jerk < 0.2) {
    level = "LOW";
  } 
  else if (jerk < 1.0) {
    level = "MED";
  } 
  else {
    level = "HIGH";
  }

  // ---- SERIAL OUTPUT (For Python) ----
  // Format: jerk,timestamp
  Serial.print(jerk, 3);
  Serial.print(",");
  Serial.println(timestamp);

  // ---- LCD DISPLAY ----
  lcd.setCursor(0, 0);
  lcd.print("Jerk:");
  lcd.print(jerk, 3);
  lcd.print(" ");
  lcd.print(level);
  lcd.print("   ");  // clear trailing characters

 

  delay(200);
}