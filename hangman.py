def hangman() :
    word = 'sir'
    wordletters=list(word)
    print(wordletters)
    usedletters=[]
    correctletters=[]
    counter=10
    while counter>0 :
        if ''.join(correctletters)==''.join(wordletters):
            print(str(correctletters))
            print('You won !')
            break
        else :
            letter = input('Input a letter :')
            try :
                letter not in (usedletters)
                if letter in (wordletters):
                    print('Usedlist before : '+str(usedletters)) #test only
                    usedletters.append(letter)
                    print('Usedlist after : '+str(usedletters)) #test only
                    print('Correctlist before : '+str(correctletters)) #test only
                    correctletters.append(letter)
                    print('Correctlist after : '+str(correctletters)) #test only
                    continue
                else :
                    print(usedletters)
                    usedletters.append(letter)
                    print(usedletters)
                    print(counter)
                    counter-=1
                    print(counter)
                    print('This letter is not in the word I chose. '+str(counter)+' attempt(s) left')
                    continue
            except :
                print('This letter has already been chosen. Choose another one.')
hangman()
