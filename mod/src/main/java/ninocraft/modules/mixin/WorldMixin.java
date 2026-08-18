package ninocraft.modules.mixin;

import net.minecraft.world.World;
import ninocraft.modules.modules.TimeChangerModule;
import ninocraft.modules.modules.WeatherModule;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;

@Mixin(World.class)
public class WorldMixin {
    @Inject(method = "getRainGradient", at = @At("HEAD"), cancellable = true)
    private void ninocraftRain(float tickDelta, CallbackInfoReturnable<Float> cir) {
        if (WeatherModule.INSTANCE.suppressRain()) {
            cir.setReturnValue(0f);
        }
    }

    @Inject(method = "getThunderGradient", at = @At("HEAD"), cancellable = true)
    private void ninocraftThunder(float tickDelta, CallbackInfoReturnable<Float> cir) {
        if (WeatherModule.INSTANCE.suppressThunder()) {
            cir.setReturnValue(0f);
        }
    }

    @Inject(method = "getTimeOfDay", at = @At("HEAD"), cancellable = true)
    private void ninocraftTime(CallbackInfoReturnable<Long> cir) {
        long tick = TimeChangerModule.INSTANCE.currentTick();
        if (tick >= 0) {
            cir.setReturnValue(tick);
        }
    }
}