---
title: Scala Takes Over Android
date: 2015-06-24
tags: scala, android
---

Scala is becoming an increasingly popular choice on Android. Why?

- concise, flexible syntax
- higher-level abstractions
- functional programming suport
- type safety
- libraries and ecosystems
- interoperability with Java

As mobile gets bigger, there is an increasing need for abstraction for solving common problems. From the vantage-point of web development, mobile development seems very verbose and low-level. 

Yet mobile development is moving in an increasingly [abstract](http://arstechnica.com/apple/2010/06/copland-2010-revisited/) direction. Apple's new Swift demonstrates a recognition of higher-level programming on iOS. And even before Swift, RubyMotion on iOS (and now Android) provided native mobile implementations of Ruby, spawning a large ecosystem of frameworks. 

Scala allows high-level programming in Android. And it turns out that Swift is [very similar](https://leverich.github.io/swiftislikescala/) to Scala.

Let's take a brief look at what Scala offers for Android.

## Lambda functions

When I first came to Android from Ruby, I was very confused by the lack of lambda functions in Java. I soon learned that Java typically uses anonymous classes for `Runnables`, `Listeners`, and `Callbacks`:

```java
button.setOnClickListener(new View.OnClickListener {
  def onClick(v:View) {
    button.setText("Clicked");
  }
});

new Handler().post(new Runnable() {
  @Override
  public void run() {
    button.setText:
  }
});

```
This is pretty clunky. Java 8 has lambdas, but Android doesn't support them without [effort](https://github.com/evant/gradle-retrolambda). How do anonymous functions look in Scala?


```scala
button.onClick(button.setText("Clicked"))
runOnUiThread(button.setText("Clicked"))
```

And a 5-liner becomes a one-liner. These examples depend on the [Scaloid](https://github.com/pocorall/scaloid) framework, but it's not hard to implement similar functionality yourself. Since functions are first-class, you can pass them around.

Imagine you had a custom `Seekbar` control with a `TextView` indicating the current progress. You could pass your control a function from the progress integer to the fully formatted text. So 2 would become "Width 2 cm." This way you have full flexibility over the text and you can use this same control with multiple units or any arbitrary suffixes or prefixes.

```scala
customSeekbarWithText.textFunction = {
  text => s"Width: $text cm." // the s before the quotes make it string interpolation
}
```

## Less Boilerplate

```java
public class LoginActivity extends Activity  {
  Button loginButton;
  EditText username, password;
   
  @Override
  protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    setContentView(R.layout.activity_main);
    
    loginButton = (Button)findViewById(R.id.loginButton);
    username = (EditText)findViewById(R.id.username);
    password = (EditText)findViewById(R.id.password);
    
    loginButton.setOnClickListener(new View.OnClickListener() {
      @Override
      public void onClick(View v) {
        // ... validate form
        Intent intent = new Intent(this, AnotherActivity.class);
        startActivity(intent);
      }
    }
  }
}
```

```scala
class LoginActivity extends SActivity with TypedFindView  {
  private lazy val loginButton = findView(TR.loginButton)
  private lazy val email = findView(TR.email)
  private lazy val password = findView(TR.password)

  onCreate {
    setContentView(R.layout.main)

    loginButton.onClick(startActivity[WelcomeActivity])
  }
}
```

I'm not going to explain how this all works, because this is the post where I'm trying to convince you to care, not the post where I get down into the nitty-gritty. For now we'll just say that this conciseness depends on android-sdk-plugin and Scaloid doing some stuff behind the scenes to thin out all that code. When using Scala, you will also have the ability to be concise in your own code.


Let's break down what is going on here:

- We are using the Scaloid framework: `import org.scaloid.common._`
- `SActivity` is Scaloid's base activity trait. A trait is like a more powerful interface.
- `TypedFindVew` gives us the `findView` method, from android-sdk-plugin. `TR` is the generated typed resources created by the plugin, so there is no need to constantly cast views to their correct type
- `lazy` means that the variable isn't evaluated until it's used
- `val` is an immutable variable
- `onCreate` is Scaloid's syntactic sugar
- `onClick` is Scaloid monkey-patching a method for `Views` with an implicit conversion. Don't worry about understanding implicit conversions right now.
- `startActivity` is a generic method that shortens `Activity` boilerplate

## Asynchronous logic

Scala's `Future` is an abstraction for asynchronous logic that is powerful and concise. 

On Android, asynchronous programming typically uses `AsyncTask`. An asynchronous operation will be a subclass of `AsyncTask` with methods for callbacks. `AsyncTasks` have the same [problem](http://tirania.org/blog/archive/2013/Aug-15.html) of all callback approaches: they are poorly _composable_, which means it's hard to combine them or order them. 

For example, say you want multiple sequential HTTP requests. Traditionally in Android, you would use an `AsyncTask`, and then fire off the next request in the `onPostExecute` callback. This approach [nests your logic](https://mttkay.github.io/blog/2013/08/25/functional-reactive-programming-on-android-with-rxjava/). There are frameworks like [Bolts](https://github.com/BoltsFramework/Bolts-Android) that let you write sequential tasks, but Scala comes with `Futures` out of the box.

A `Future` is a type that represents an asynchronous operation that is either _successful_ or a _failure_. A `Promise` is a container for a future that can be manually completed or failed. A single `Future` might look like this:

```scala
val userFuture = User.findByEmail("a@b.com")

userFuture.onSuccess {
  case user => Log.v(LOG_TAG, user.id.toString)
}
userFuture.onFailure {
  case e => Log.v(LOG_TAG, e.getMessage)
}
```

So far, all we have is a success callback. But `Futures` really shine when you have multiple asynchronous operations.


### Sequential asynchronous operations

If you wrap your HTTP requests in `Promises` and have them return `Futures`, then you can can execute them in sequence. Don't worry about the `Promise` part now, for now we will just look at the `Future` side:

```scala

for {
  user <- User.findByEmail("a@b.com") // findByEmail returns a Future
  posts <- user.findPosts()
} yield {
  Log.v(LOG_TAG, s"User: ${user.id}, first post: ${posts(0).title}")
}
```

The `for` isn't a "for loop," it's a `for comprehension`, which is Scala's syntactic sugar for chaining operations.

### Parallel asynchronous operations

What if instead of running `Futures` in sequence, you want to run them in parallel and do something when they are all done? It's easy to run two `AsyncTasks` in parallel, but doing something when they are both done would be annoying, because each callback would have check whether the other callback was completed using shared mutable state.

What we really need is a tool that will take a bunch of `Futures` and then notifies us when they are all done.

```scala
// Transform an array of posts into a sequence of post-deletion requests
// post.delete() returns a Future that completes when the request returns
val deletions: Seq[Future[Int]] = posts.map(_.delete()).toSeq

// assuming all deletions succeed, you will get a Seq of post id's of the deleted posts
Future.sequence(deletions) onSuccess {
  case d: Seq[Int] => Log.v(LOG_TAG, d.mkString(", "))
}
```
What the heck is a `Seq[Future[Int]]`? It's just what it sound like: a `Seq` of `Futures` of `Ints`, or a sequence of operations that will give you an `Int` in the future. `Future.sequence` takes a `Seq[Future[Int]]` and gives you a `Future[Seq[Int]]`. It gives you a `Future` of the `Seq` formed by the results of all the `Futures` that you pass it. It's really nice how Scala gives you abstractions like this for really common asynchronous tasks.

I know I'm glossing over a few things here, like handling failure of `Futures` (easy), and canceling `Futures` (Scala's standard `Future` cannot be canceled, but there are other implementations like Twitter's that can be). I'm also not going to write out how these examples would look with `AsyncTask` because it would be long and I have much better stuff to do with my life.

### Threading

You might be wondering, what thread are these `Futures` running on to avoid blocking? `Futures` in Scala run in an `implicit ExecutionContext`. Scala has a concept of "implicit" parameters, which are defined with the `implicit` keyword and don't have to be manually passed in. Implicits get pretty complicated, but the main thing you need is an `implicit ExecutionContext` in scope that `Futures` will grab. Scala's standard `ExecutionContext` is usually imported like this: `import ExecutionContext.Implicits.global`, but we will use Android's `ThreadPoolExecutor` [instead](http://blog.scaloid.org/2013/11/using-scalaconcurrentfuture-in-android.html?showComment=1407420609604#c3177025541659882407).

```scala
// this needs to be in scope somewhere or imported
implicit val execContext = ExecutionContext.fromExecutor(AsyncTask.THREAD_POOL_EXECUTOR)

Future { // this Future grabs the implicit execContext and uses it
  doSomethingInThreadPool()
} onSuccess {
  case result => runOnUiThread( updateUi() )
}

// equivalent to passing in an explicit parameter like this:
val execContext = ExecutionContext.fromExecutor(AsyncTask.THREAD_POOL_EXECUTOR)

Future {
  doSomethingInThreadPool()
}(execContext) onSuccess {
  case result => runOnUiThread( updateUi() )
}
```

Use a `Future` to jump onto your thread pool, and then Scaloid's `runOnUiThread` to jump back onto the main/UI thread so you can update the UI. With [Macroid](http://macroid.github.io/), there are extensions to `Futures` like `onSuccessUi` which runs the success callback on the UI thread:

```scala
implicit val execContext = ExecutionContext.fromExecutor(AsyncTask.THREAD_POOL_EXECUTOR)

Future {
  doSomethingInThreadPool()
} onSuccessUi {
  case result => updateUi()
}


## Resources

These are only a few of the goodies that Scala gives you on Android. Here are some additional resources for Scala on Android:

- [Scala On Android: The Comprehensive Documentation](http://scala-on-android.taig.io/)
- [Scala On Android: Preparing the Environment](http://www.47deg.com/blog/scala-on-android-preparing-the-environment)
- [Five Reasons Why You Should Use Scala On Android](http://threedimensionsblog.blogspot.com/2014/08/five-reasons-why-you-should-use-scala.html)
- [Scala on Android: Motivation, Building and useful libraries](http://threedimensionsblog.blogspot.com/2014/08/scala-on-android-motivation-building.html)
- Frameworks: [Scaloid](https://github.com/pocorall/scaloid), [Macroid](http://macroid.github.io/)

