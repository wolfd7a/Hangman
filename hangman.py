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
    word = 'sir'
    wordletters=list(word)
    usedletters=[]
    correctletters=[]
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
                    correctletters.append(letter)
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
