import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  LayoutChangeEvent,
  Text,
  GestureResponderEvent,
  PanResponderGestureState,
} from "react-native";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onValueChange: (value: number) => void;
  minLabel?: string;
  maxLabel?: string;
  trackColor?: string;
  activeTrackColor?: string;
  thumbColor?: string;
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  onValueChange,
  minLabel = "Min",
  maxLabel = "Max",
  trackColor = "#2a2a2a",
  activeTrackColor = "#6200EE",
  thumbColor = "#fff",
}: SliderProps): React.ReactElement {
  const [trackWidth, setTrackWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartXRef = useRef(0);
  const dragStartValueRef = useRef(value);

  const snapToStep = (val: number): number => {
    const snapped = Math.round(val / step) * step;
    return Math.max(min, Math.min(max, snapped));
  };

  const valueToPosition = (val: number): number => {
    if (trackWidth === 0) return 0;
    return ((val - min) / (max - min)) * trackWidth;
  };

  const positionToValue = (x: number): number => {
    if (trackWidth === 0) return min;
    const ratio = Math.max(0, Math.min(1, x / trackWidth));
    return snapToStep(min + ratio * (max - min));
  };

  const handleGrant = (evt: GestureResponderEvent): void => {
    setIsDragging(true);
    dragStartXRef.current = evt.nativeEvent.locationX;
    dragStartValueRef.current = value;
    
    // Jump to tapped position
    const newValue = positionToValue(evt.nativeEvent.locationX);
    if (newValue !== value) {
      onValueChange(newValue);
      dragStartValueRef.current = newValue;
    }
  };

  const handleMove = (
    _evt: GestureResponderEvent,
    gestureState: PanResponderGestureState
  ): void => {
    // Calculate new position based on drag delta from starting point
    const startPosition = valueToPosition(dragStartValueRef.current);
    const newPosition = startPosition + gestureState.dx;
    const newValue = positionToValue(newPosition);
    
    if (newValue !== value) {
      onValueChange(newValue);
    }
  };

  const handleRelease = (): void => {
    setIsDragging(false);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: handleGrant,
      onPanResponderMove: handleMove,
      onPanResponderRelease: handleRelease,
      onPanResponderTerminate: handleRelease,
    })
  ).current;

  const handleLayout = (event: LayoutChangeEvent): void => {
    setTrackWidth(event.nativeEvent.layout.width);
  };

  const thumbX = valueToPosition(value);
  const progressPercent = ((value - min) / (max - min)) * 100;
  const numSteps = Math.floor((max - min) / step) + 1;

  return (
    <View style={styles.container}>
      <View
        style={styles.trackContainer}
        onLayout={handleLayout}
        {...panResponder.panHandlers}
      >
        {/* Track background */}
        <View style={[styles.track, { backgroundColor: trackColor }]} />

        {/* Active track */}
        <View
          style={[
            styles.activeTrack,
            {
              backgroundColor: activeTrackColor,
              width: `${progressPercent}%`,
            },
          ]}
        />

        {/* Tick marks */}
        <View style={styles.tickContainer} pointerEvents="none">
          {Array.from({ length: numSteps }).map((_, i) => {
            const tickValue = min + i * step;
            const tickPercent = ((tickValue - min) / (max - min)) * 100;
            const isActive = tickValue <= value;
            return (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    left: `${tickPercent}%`,
                    backgroundColor: isActive ? activeTrackColor : trackColor,
                    opacity: isActive ? 1 : 0.5,
                  },
                ]}
              />
            );
          })}
        </View>

        {/* Thumb */}
        {trackWidth > 0 && (
          <View
            pointerEvents="none"
            style={[
              styles.thumb,
              {
                left: thumbX - 12,
                backgroundColor: thumbColor,
                shadowOpacity: isDragging ? 0.5 : 0.3,
              },
            ]}
          >
            <View
              style={[styles.thumbInner, { backgroundColor: activeTrackColor }]}
            />
          </View>
        )}
      </View>

      {/* Labels */}
      <View style={styles.labelContainer}>
        <Text style={styles.label}>{minLabel}</Text>
        <Text style={styles.label}>{maxLabel}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  trackContainer: {
    height: 44,
    justifyContent: "center",
    position: "relative",
  },
  track: {
    height: 4,
    borderRadius: 2,
    width: "100%",
  },
  activeTrack: {
    height: 4,
    borderRadius: 2,
    position: "absolute",
    left: 0,
  },
  tickContainer: {
    position: "absolute",
    width: "100%",
    height: "100%",
    justifyContent: "center",
  },
  tick: {
    position: "absolute",
    width: 2,
    height: 8,
    borderRadius: 1,
    marginLeft: -1,
  },
  thumb: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#6200EE",
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 8,
    elevation: 4,
  },
  thumbInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  label: {
    fontSize: 11,
    color: "#666",
    fontWeight: "500",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});

export default Slider;
