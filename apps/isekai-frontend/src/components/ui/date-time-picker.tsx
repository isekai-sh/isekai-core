import * as React from "react"
import { CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { getTimezoneAbbreviation } from "@/lib/timezone"

interface DateTimePickerProps {
  date?: Date
  setDate: (date: Date | undefined) => void
  label?: string
  minDate?: Date
}

// Generate 24-hour format (00-23)
const hours24 = Array.from({ length: 24 }, (_, i) => ({
  value: i.toString(),
  label: `${i.toString().padStart(2, '0')}:00`
}))

// Generate minutes in 15-minute intervals
const minutes = Array.from({ length: 4 }, (_, i) => {
  const minute = i * 15
  return {
    value: minute.toString(),
    label: minute.toString().padStart(2, '0')
  }
})

export function DateTimePicker({
  date,
  setDate,
  label = "Pick a date and time",
  minDate,
}: DateTimePickerProps) {
  // Set minimum date to today at midnight (allows selecting today)
  const minDateResolved = React.useMemo(() => {
    if (minDate) return minDate;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }, [minDate]);

  const [hourValue, setHourValue] = React.useState<string>(
    date ? date.getHours().toString() : "12"
  )
  const [minuteValue, setMinuteValue] = React.useState<string>(
    date ? (Math.floor(date.getMinutes() / 15) * 15).toString() : "0"
  )

  // Check if selected date is today
  const isToday = React.useMemo(() => {
    if (!date) return false;
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }, [date]);

  // Get minimum valid time for today (current time + 1 hour)
  const minTimeToday = React.useMemo(() => {
    if (!isToday) return null;
    const now = new Date();
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000);
    return {
      hour: oneHourFromNow.getHours(),
      minute: oneHourFromNow.getMinutes()
    };
  }, [isToday]);

  // Filter available hours based on whether it's today
  const availableHours = React.useMemo(() => {
    if (!isToday || !minTimeToday) return hours24;
    // Show hours >= minimum hour from now + 1 hour
    return hours24.filter(h => parseInt(h.value) >= minTimeToday.hour);
  }, [isToday, minTimeToday]);

  // Filter available minutes based on selected hour for today
  const availableMinutes = React.useMemo(() => {
    if (!isToday || !minTimeToday) return minutes;

    const selectedHour = parseInt(hourValue);

    // If selected hour is exactly the minimum hour, filter minutes
    if (selectedHour === minTimeToday.hour) {
      // Round up to next 15-minute interval
      const minMinute = Math.ceil(minTimeToday.minute / 15) * 15;
      return minutes.filter(m => parseInt(m.value) >= minMinute);
    }

    // For hours after minimum, all minutes are available
    return minutes;
  }, [isToday, minTimeToday, hourValue]);

  // Sync hour and minute when date prop changes
  React.useEffect(() => {
    if (date) {
      setHourValue(date.getHours().toString());
      setMinuteValue((Math.floor(date.getMinutes() / 15) * 15).toString());
    }
  }, [date]);

  // Auto-adjust minute if it becomes invalid for selected hour
  React.useEffect(() => {
    if (isToday && minTimeToday && availableMinutes.length > 0) {
      const currentMinute = parseInt(minuteValue);
      const isMinuteValid = availableMinutes.some(m => parseInt(m.value) === currentMinute);

      if (!isMinuteValid) {
        // Set to first available minute
        const firstAvailableMinute = availableMinutes[0].value;
        setMinuteValue(firstAvailableMinute);
      }
    }
  }, [isToday, minTimeToday, availableMinutes, minuteValue]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) {
      setDate(undefined)
      return
    }

    // Preserve the time when selecting a new date
    const hour = parseInt(hourValue)
    const minute = parseInt(minuteValue)
    selectedDate.setHours(hour, minute, 0, 0)

    // If selecting today and current time is invalid, adjust to minimum valid time
    const now = new Date()
    const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000)

    if (selectedDate < oneHourFromNow) {
      // Set to 1 hour from now, rounded to next 15-minute interval
      const newHour = oneHourFromNow.getHours()
      const newMinute = Math.ceil(oneHourFromNow.getMinutes() / 15) * 15

      if (newMinute >= 60) {
        selectedDate.setHours(newHour + 1, 0, 0, 0)
        setHourValue((newHour + 1).toString())
        setMinuteValue("0")
      } else {
        selectedDate.setHours(newHour, newMinute, 0, 0)
        setHourValue(newHour.toString())
        setMinuteValue(newMinute.toString())
      }
    }

    setDate(selectedDate)
  }

  const handleHourChange = (newHour: string) => {
    setHourValue(newHour)

    // Check if current minute is still valid for the new hour
    if (isToday && minTimeToday) {
      const selectedHour = parseInt(newHour);
      const currentMinute = parseInt(minuteValue);

      if (selectedHour === minTimeToday.hour) {
        const minMinute = Math.ceil(minTimeToday.minute / 15) * 15;
        if (currentMinute < minMinute) {
          // Auto-adjust to minimum valid minute
          setMinuteValue(minMinute.toString());
          updateDateTime(selectedHour, minMinute);
          return;
        }
      }
    }

    updateDateTime(parseInt(newHour), parseInt(minuteValue))
  }

  const handleMinuteChange = (newMinute: string) => {
    setMinuteValue(newMinute)
    updateDateTime(parseInt(hourValue), parseInt(newMinute))
  }

  const updateDateTime = (hour: number, minute: number) => {
    if (!date) {
      // If no date is selected, set it to today with the new time
      const newDate = new Date()
      newDate.setHours(hour, minute, 0, 0)
      setDate(newDate)
    } else {
      // Update the time on the existing date
      const newDate = new Date(date)
      newDate.setHours(hour, minute, 0, 0)
      setDate(newDate)
    }
  }

  const timezone = getTimezoneAbbreviation();

  return (
    <div className={label ? "space-y-2" : ""}>
      {label && <Label>{label}</Label>}
      <div className="flex gap-2 items-center">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "h-8 justify-start text-left font-normal",
                !date && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {date ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : <span>Pick date</span>}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={(date) => date < minDateResolved}
              initialFocus
            />
          </PopoverContent>
        </Popover>
        <Select value={hourValue} onValueChange={handleHourChange} disabled={!date}>
          <SelectTrigger className="w-16 h-8">
            <SelectValue placeholder="Hour" />
          </SelectTrigger>
          <SelectContent>
            {availableHours.map((hour) => (
              <SelectItem key={hour.value} value={hour.value}>
                {hour.label.split(':')[0]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-sm">:</span>
        <Select value={minuteValue} onValueChange={handleMinuteChange} disabled={!date}>
          <SelectTrigger className="w-16 h-8">
            <SelectValue placeholder="Min" />
          </SelectTrigger>
          <SelectContent>
            {availableMinutes.map((minute) => (
              <SelectItem key={minute.value} value={minute.value}>
                {minute.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {date && (
          <span className="text-xs text-muted-foreground">
            {timezone}
          </span>
        )}
      </div>
    </div>
  )
}
