// UX-friendly language support for OneCompiler language ids.
// We keep CodeMirror modes/templates curated for common languages; unknown languages fallback gracefully.

const TEMPLATES_BY_ID = {
    // Programming
    python: `import sys\n\n# Read entire stdin\ndata = sys.stdin.read()\nprint("Hello, world!")\n`,
    python2: `import sys\n\ndata = sys.stdin.read()\nprint "Hello, world!"\n`,
    javascript: `// Read from stdin? Add input in the Output panel.\nconsole.log("Hello, world!");\n`,
    nodejs: `// Read from stdin? Add input in the Output panel.\nconsole.log("Hello, world!");\n`,
    typescript: `// TypeScript\nconst msg: string = "Hello, world!";\nconsole.log(msg);\n`,
    java: `import java.io.*;\n\npublic class Main {\n  public static void main(String[] args) throws Exception {\n    System.out.println("Hello, world!");\n  }\n}\n`,
    c: `#include <stdio.h>\n\nint main() {\n  printf(\"Hello, world!\\n\");\n  return 0;\n}\n`,
    cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n  ios::sync_with_stdio(false);\n  cin.tie(nullptr);\n\n  cout << \"Hello, world!\\n\";\n  return 0;\n}\n`,
    csharp: `using System;\n\npublic class Program\n{\n  public static void Main()\n  {\n    Console.WriteLine(\"Hello, world!\");\n  }\n}\n`,
    go: `package main\n\nimport \"fmt\"\n\nfunc main() {\n  fmt.Println(\"Hello, world!\")\n}\n`,
    ruby: `puts "Hello, world!"\n`,
    php: `<?php\n\necho \"Hello, world!\\n\";\n`,
    rust: `use std::io::{self, Read};\n\nfn main() {\n    let mut input = String::new();\n    io::stdin().read_to_string(&mut input).ok();\n    println!(\"Hello, world!\");\n}\n`,
    kotlin: `fun main() {\n    println(\"Hello, world!\")\n}\n`,
    swift: `import Foundation\n\nprint(\"Hello, world!\")\n`,
    scala: `object Main {\n  def main(args: Array[String]): Unit = {\n    println(\"Hello, world!\")\n  }\n}\n`,
    bash: `#!/usr/bin/env bash\n\necho \"Hello, world!\"\n`,
    sh: `echo "Hello, world!"\n`,
    perl: `print "Hello, world!\\n";\n`,
    lua: `print("Hello, world!")\n`,
    r: `cat("Hello, world!\\n")\n`,
    haskell: `main :: IO ()\nmain = putStrLn \"Hello, world!\"\n`,
    elixir: `IO.puts("Hello, world!")\n`,
    erlang: `-module(main).\n-export([main/0]).\n\nmain() ->\n  io:format(\"Hello, world!~n\").\n`,
    dart: `void main() {\n  print('Hello, world!');\n}\n`,
    julia: `println(\"Hello, world!\")\n`,
    clojure: `(println \"Hello, world!\")\n`,
    groovy: `println "Hello, world!"\n`,
    objectivec: `#import <Foundation/Foundation.h>\n\nint main(int argc, const char * argv[]) {\n  @autoreleasepool {\n    NSLog(@\"Hello, world!\");\n  }\n  return 0;\n}\n`,
    pascal: `program Main;\nbegin\n  writeln('Hello, world!');\nend.\n`,
    fortran: `program main\n  print *, 'Hello, world!'\nend program main\n`,
    cobol: `       IDENTIFICATION DIVISION.\n       PROGRAM-ID. HELLO.\n       PROCEDURE DIVISION.\n           DISPLAY 'Hello, world!'.\n           STOP RUN.\n`,
    // Databases (simple defaults)
    mysql: `-- Write a query\nSELECT 'Hello, world!' AS msg;\n`,
    postgresql: `-- Write a query\nSELECT 'Hello, world!' AS msg;\n`,
    sqlite: `-- Write a query\nSELECT 'Hello, world!' AS msg;\n`,
    mongodb: `// MongoDB shell\ndb.stats();\n`,
};

const MODES_BY_ID = {
    javascript: { name: 'javascript', json: false },
    nodejs: { name: 'javascript', json: false },
    typescript: 'text/typescript',
    python: { name: 'python' },
    python2: { name: 'python' },
    java: 'text/x-java',
    cpp: 'text/x-c++src',
    c: 'text/x-csrc',
    csharp: 'text/x-csharp',
    go: 'text/x-go',
    ruby: 'ruby',
    php: 'application/x-httpd-php',
};

export function guessSupportFromOneCompilerLanguage({ id = '', name = '' } = {}) {
    const key = String(id || '').toLowerCase();
    const label = String(name || id || '').toLowerCase();

    const template =
        TEMPLATES_BY_ID[key] ||
        // small name-based fallbacks for variants like "C++" or "C#"
        (label.includes('c++') ? TEMPLATES_BY_ID.cpp : '') ||
        (label.includes('c#') ? TEMPLATES_BY_ID.csharp : '') ||
        (label.includes('javascript') ? TEMPLATES_BY_ID.javascript : '') ||
        (label.includes('python') ? TEMPLATES_BY_ID.python : '') ||
        '';

    const mode =
        MODES_BY_ID[key] ||
        (label.includes('c++') ? MODES_BY_ID.cpp : null) ||
        (label.includes('c#') ? MODES_BY_ID.csharp : null) ||
        (label.includes('java') ? MODES_BY_ID.java : null) ||
        (label.includes('python') ? MODES_BY_ID.python : null) ||
        { name: 'javascript', json: false };

    return { mode, template };
}


