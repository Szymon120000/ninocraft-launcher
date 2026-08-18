package ninocraft.modules.modules;

import ninocraft.modules.Module;
import ninocraft.modules.ModuleOption;

public class TimeChangerModule extends Module {
    public static final TimeChangerModule INSTANCE = new TimeChangerModule();

    private static final String[] TIMES = { "Off", "Morning", "Noon", "Sunset", "Midnight" };
    private static final long[] TICKS = { -1, 1000, 6000, 13000, 18000 };

    private final ModuleOption.ChoiceOption time = new ModuleOption.ChoiceOption("time", "Time", "Off", TIMES);

    public TimeChangerModule() {
        super("timechanger", "Time Changer", "Sets a fixed time of day on the client.");
        addOption(time);
    }

    public long currentTick() {
        if (!isEnabled()) return -1;
        for (int i = 0; i < TIMES.length; i++) {
            if (TIMES[i].equals(time.get())) return TICKS[i];
        }
        return -1;
    }
}