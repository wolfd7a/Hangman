import sys

def RaiseException() :
    print("I did not understand you're answer")

def ProgramEnd() :
    sys.exit(0)

def GoAgain() :
    restart = input('Do you want to play again ?')
    if restart in ('yes','Yes','yEs','yeS','YEs','yES','YeS','YES') :
        hangman()
    elif restart in ('no','No','nO','NO') :
        ProgramEnd()
    else :
        RaiseException()
        GoAgain()

def hangman() :
    word = ''
    wordletters=list(word)
    LetterCount=len(wordletters)
    usedletters=[]
    correctletters=[]
    j=0
    for j in range(LetterCount) :
        correctletters.append('_')
        j+=1
    counter=10
    while counter>0 :
        if ''.join(correctletters)==''.join(wordletters):
            print('You won ! '+str(word)+' was the correct word.')
            GoAgain()
            break
        else :
            letter = input('Input a letter :')
            try :
                letter not in (usedletters)
                if letter in (wordletters):
                    usedletters.append(letter)
                    i=0
                    for i in range(LetterCount) :
                        if i==wordletters.index(letter)  :
                            correctletters[i] = letter
                            i+=1
                        else :
                            i+=1
                    print(''.join(correctletters))
                    continue
                else :
                    usedletters.append(letter)
                    counter-=1
                    print('This letter is not in the word I chose. '+str(counter)+' attempt(s) left')
                    continue
            except :
                print('This letter has already been chosen. Choose another one.')
    GoAgain()
hangman()
