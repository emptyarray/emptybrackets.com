---
title: Advanced Android Animation in Scala
date: 2015-07-11
tags: scala, android
---

<div class="android-frame">
  <div class="android-screen">
    <div class="image-container">
      <img src="/images/animation.gif" class="android-gif" />
    </div>
  </div>
  <div class="android-home-button"></div>
</div>

On mobile, it's really important for animations to feel tactile and physical. When doing complex animations, it's common to chain together animations, or even interleave animations with other operations, like changing text. Neither Android nor iOS handle multi-stage animations gracefully. We are going to build a new animation approach that is cleaner and more powerful.

My belief is that with a more concise animation system, you will be encouraged to use animations more, whereas with verbose and clunky animation systems, you will be tempted to skimp on animations.

## What we are building

```scala
async {
  await(refreshButton.animateAlpha(0.5f, 500 millis))
  onUiThread { refreshButton.setEnabled(false) }

  val fakeHttpRequest = getBalance()

  await(progress.animateAlpha(1f, 500 millis))

  // asynchronously wait for the new balance from the server
  val newBalance: Int = await(fakeHttpRequest)

  await(accountBalance.animateScale(0.8f, 0.8f, 300 millis))

  // animate the dollar amount
  val numberAnimation = ViewHelper.valueAnimator(
    startBalance,
    newBalance, // the new balance from the server
    1.5 seconds,
    new DecelerateInterpolator(1),
    new IntEvaluator()
  ) {
    v => accountBalance.setText("$" + v.toString)
  }

  await(numberAnimation)
  await(accountBalance.animateScale(1f, 1f, 500 millis, new OvershootInterpolator(3f)))
  await(progress.animateAlpha(0f, 500 millis))
  await(refreshButton.animateAlpha(1f, 500 millis))

  onUiThread { refreshButton.setEnabled(true) }
}
```

This probably looks like no Android code that you've seen before. It's a combination of Scala's `Futures` and animatior helpers that we will write, which lets us chain the animations in a straightforward and linear way.

The refresh animation is deceptively simple: it's actually built from 8 animations along with an HTTP request and other UI changes. This is incredibly compact.

## Why do I do this?

Android has a zillion animation APIs but they all feel like they are lacking something.

- View Animation and `ViewPropertyAnimator`: Can only animate certain properties. Cannot animate text color, drawable properties like background color, or `LayoutParams`.

- Property Animation: `ValueAnimator` and `ObjectAnimator` are powerful, can animate arbitary objects unlike iOS. Low-level, verbose, and annoying to compose. Specifying both the start value and end value gets tiring really quickly.

- `AnimationSet`: Can compose multiple animations into a chain, but cannot compose animations with non-animations, like changing views or other asynchronous operations.

- XML-based animations: Inflexible due to hard-coded magic numbers.

The biggest problem with all these animation approaches is their __composability__. It's awkward to chain animations with other animations or with things that are not animations.

### Composability, composability, composability

When you are only chaining two animations, traditional Android animation works pretty well. For example, here is `ViewPropertyAnimator` in Java:

```java
textView.animate().alpha(0f).setDuration(500).withEndAction(new Runnable() {
  @Override
  public void run() {
    textView.setText("REFRESHED TEXT");
    textView.animate().alpha(1f).setDuration(500);
  }
});
```
Looks fine. So far. But if we try to add on a couple more animations, you encounter callback hell:

```java
textView.animate().alpha(0f).setDuration(500).withEndAction(new Runnable() {
  @Override
  public void run() {
    textView.setText("REFRESHED TEXT");

    textView.animate().alpha(1f).setDuration(500).withEndAction(new Runnable() {
      @Override
      public void run() {
        textView.animate().scaleX(1.03f).scaleY(1.03f).setDuration(300).withEndAction(new Runnable() {
          @Override
          public void run() {
            textView.animate().scaleX(1f).scaleY(1f).setDuration(500);
          }
        });
      }
    });
  }
});
```

If you keep going like this, you are going to hit editor-window overflow. 

`ValueAnimator`/`ObjectAnimator` have similar issues with nesting.

To make things even more complicated, what if you wanted to compose your refresh animation with an HTTP request? If we wanted to do something like (1) fade out, (2) run HTTP request to retrieve the new resource, and (3) fade in with new text, then it would be a total mess of callbacks.

Let's make our own animation helper that is composable. The goal:

- Chain animations in sequence
- Run animations in parallel
- Avoid needing to specify start values
- Animate anything
- Concise syntax
- Animations can be composed with non-animations and with asynchronous operations like HTTP requests
- No nesting in multi-stage animations

## Animation with Futures

My previous article about [Scala on Android](http://emptybrackets.com/2015/06/24/scala-takes-over-android.html) introduced Scala's `Future` abstraction for dealing with asynchronous operations. When doing animations, I reached for `Futures` because they are asynchronous. If your animations are in `Futures`, and your HTTP requests are also in `Futures`, then you can compose animations and HTTP requests! I got this idea from trying to comprehend the [Macroid](http://macroid.github.io/) Scala Android framework.

We are going to make some animation helpers by __wrapping `ValueAnimators` inside `Futures`__. To make things even more succint, we are going to patch our animation methods onto `Views`.

### Example: Fade out a button, then disable it
```scala
button.animateAlpha(0f, 500 millis) onSuccess(case _ => button.setEnabled(false))
```
## The Implementation

We will give `Views` our animation helper methods by using Scala's implicit wrapper class construct:

```scala
object ViewHelper {
  implicit class AnimatedView(v: View) {
    def animateAlpha(alpha: Float, duration: FiniteDuration): Future[Unit] = {
      //...
    }
  }
}

// in Activity, import the wrapper conversion into scope
import com.emptyarray.scala.android.util.ViewHelper._

// all `Views` are now implicitly wrapped in AnimatedViews,
// and now have `animateAlpha`
view.animateAlpha(0f, 500 millis)

```

### ValueAnimator, first try

`ValueAnimators` are very powerful and general, but they have a lot of boilerplate. Let's make a helper that gives us a `ValueAnimator` in one shot, runs a closure from an `AnimatorUpdateListener` and returns a `Future` that completes when the animation is done.

```scala
object ViewHelper extends UiThreadHelper {
  def valueAnimator(start: Float, 
                    stop: Float, 
                    duration: FiniteDuration)(f: Float => Unit): Future[Unit] = {

    val animator = ValueAnimator.ofFloat(start, stop)

    animator.setDuration(duration.toMillis)

    animator.addUpdateListener(new AnimatorUpdateListener {
      override def onAnimationUpdate(animator: ValueAnimator): Unit = {
        f(animator.getAnimatedValue.asInstanceOf[Float])
      }
    })

    runAnimator(animator) // we will write this soon
  }
}
```

Things to notice:

- `FiniteDuration` is Scala's time duration class which let's you write stuff like `1.5 seconds` instead of only using milliseconds as a `Long`
- You might notice that there are two parameter sets in parentheses! That's because it's a curried function. This is nicer for syntax.
- `f: Float => Unit` means a function from a `Float` to `Unit`. `Unit` is Scala's `void`. This function will run for every update of the animation, and we will access the `Float` as the animated value.
- Returns a `Future`

But this version is too simplistic. What if we want to animate an `Int` instead of a `Float`? What if we want to use a different `Interpolator` or `Evaluator`?

### ValueAnimator, second try

```scala
object ViewHelper extends UiThreadHelper {
  def valueAnimator[A, T](start: A, stop: A, duration: FiniteDuration,
                       interpolator: TimeInterpolator,
                       evaluator: TypeEvaluator[T])
                      (f: A => Unit): Future[Unit] = {

    // pattern match handles the casting                  
    val animator = (start, stop) match {
      case (s: Float, e: Float) => ValueAnimator.ofFloat(s, e)
      case (s: Int, e: Int) => ValueAnimator.ofInt(s, e)
    }

    animator.setDuration(duration.toMillis)
    animator.setInterpolator(interpolator)
    animator.setEvaluator(evaluator)

    animator.addUpdateListener(new AnimatorUpdateListener {
      override def onAnimationUpdate(animator: ValueAnimator): Unit = {
        f(animator.getAnimatedValue.asInstanceOf[A])
      }
    })

    runAnimator(animator)
  }
}
```

Now `valueAnimator` is more generic thanks to the type parameters: one for the type of the `ValueAnimator`, and the other for the type of the `Evaluator`.

Next we will actually run the `ValueAnimator` inside a `Future`.

### ValueAnimator in a Future

```scala
object ViewHelper {
  def runAnimator(animator: Animator): Future[Unit] = {
    val p = Promise[Unit]()

    animator.addListener(new AnimatorListenerAdapter {
      override def onAnimationEnd(animator: Animator): Unit = p.success(())
      override def onAnimationCancel(animtor: Animator): Unit = p.success(())
    })

    onUiThread(animator.start())

    p.future
  }
}
```
We start a `Promise`, and run the animator (on the UI thread), completing the promise when the animation is ended or canceled. We return the `Promise's` `Future`, which can be observed by consumers. There is no way to cancel an animation right now, but this approach could be extended to add one.

With our helpers, we can now _animate any function we want_. Well, any function that takes a `Float` and returns nothing.

### animateAlpha, the whole story

```scala
implicit class AnimatedView(v: View) {

  def animateAlpha(alpha: Float, duration: FiniteDuration): Future[Unit] = {

    getFromUiThread(v.getAlpha).flatMap {
      startAlpha =>

        ViewHelper.valueAnimator(startAlpha, alpha, duration,
          new AccelerateDecelerateInterpolator(), new FloatEvaluator())(v.setAlpha)
    }
  }
}
```
OK, I admit that this is starting to get a little complicated. But I'll explain what's going on here:

- The key part is that we are now using `valueAnimator` to animate a function
- The function we are animating is `setAlpha` on the `View` that wrapped in our implicit class. `v.setAlpha` is a short-hand for a function invocation like `{ x => v.setAlpha(x) }`, where `x` is passed from our `ValueAnimator's` `getAnimatedValue`
- I don't want to want to have to specify the start alpha: it should be the `View's` current alpha. The problem is that I'm being a bit mean to myself and I'm not willing to assume that I'm on the UI thread.
- To get the `View's` initial alpha, I run `getAlpha` in a `Future` that runs on the UI thread. That's what `getFromUiThread` does, and you can see the implementation [on Github](https://github.com/emptyarray/scala-android-animation/blob/master/src/main/scala/com/emptyarray/scala/android/util/UiThreadExecutionContext.scala).
- What is `flatMap`? That's the question that all beginning Scala developers ask. `flatMap` is an idea from functional programming. In the context of a `Future`, what you need to know is that _`flatMap` lets you chain `Futures` together_.

The payoff for this complexity is that we can have animations without a start value, and we can start them from any thread. This will make our code much cleaner in other places.

### Animating Numbers

Since we can animate functions, we can animate the numbers with the `valueAnimator` helper also:

```scala
ViewHelper.valueAnimator(
  startBalance,
  newBalance,
  1.5 seconds,
  new DecelerateInterpolator(1),
  new IntEvaluator()
) {
  v => accountBalance.setText("$" + v.toString)
}
```
`v => accountBalance.setText("$" + v.toString)` is the animation function that we are passing in. This returns a `Future` that we can chain with other animations.

### So how do you chain animations?

Normally in Scala, you would chain `Futures` like using `for` comprehensions:

```scala
// fade a view in, then out, then make it gone
for {
  a <- progress.animateAlpha(1f, 500 millis)
  b <- progress.animateAlpha(0f, 500 millis)
} yield onUiThread { progress.setVisibility(View.GONE) }
```

This syntax isn't nested, but it is a little awkard. `for` comprehensions require extracting the value of the `Future` into the variables on the left, but we don't need that because our animation helpers return `Unit` (`void`).

Luckily, [scala-async](https://github.com/scala/async) supplies macros that let us wait for `Futures` to complete without blocking:

```scala
import scala.async.Async.{async, await}

async {
  await(progress.animateAlpha(1f, 500 millis))
  await(progress.animateAlpha(0f, 500 millis))
  onUiThread { progress.setVisibility(View.GONE) }
}
```

Much more intuitive. And note the ease of composing `Futures` with other operations, like changing the UI.

## The full animation

<div class="android-frame">
  <div class="android-screen">
    <div class="image-container">
      <img src="/images/animation.gif" class="android-gif" />
    </div>
  </div>
  <div class="android-home-button"></div>
</div>

Now that chaining animations is easy, let's go to town and write a really complex refresh animation, interleaved with an HTTP request and with enabling/disabling the refresh button. Imagine how much more code this would take in a normal Java Android approach!

```scala
async {
  await(refreshButton.animateAlpha(0.5f, 500 millis))
  onUiThread { refreshButton.setEnabled(false) }

  val fakeHttpRequest = getBalance()

  await(progress.animateAlpha(1f, 500 millis))

  // asynchronously wait for the new balance from the server
  val newBalance: Int = await(fakeHttpRequest)

  await(accountBalance.animateScale(0.8f, 0.8f, 300 millis))

  val numberAnimation = ViewHelper.valueAnimator(
    startBalance,
    newBalance,
    1.5 seconds,
    new DecelerateInterpolator(1),
    new IntEvaluator()
  ) {
    v => accountBalance.setText("$" + v.toString)
  }

  await(numberAnimation)
  await(accountBalance.animateScale(1f, 1f, 500 millis, new OvershootInterpolator(3f)))
  await(progress.animateAlpha(0f, 500 millis))
  await(refreshButton.animateAlpha(1f, 500 millis))

  onUiThread { refreshButton.setEnabled(true) }
}
```

We need `onUiThread` because the `async` block is running in the thread pool, not on the main thread. See my [previous article](//rbs-macbook-pro.local:4567/2015/06/24/scala-takes-over-android.html) for more explanation about threading. Find this whole project on Github with the full implementation:

<span class="github">
  <span class="icon-github large-github-icon"></span>[Project On Github](https://github.com/emptyarray/scala-android-animation)
</span>

